import React, { useState, useEffect, useRef } from "react";


function App() {
  // ── Auth state (per-tab) ─────────────────────────────────────────────────
  const [token, setToken] = useState(sessionStorage.getItem("token") || "");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [authError, setAuthError] = useState("");

  // ── Rooms & chat state ────────────────────────────────────────────────────
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const ws = useRef(null);

  // 0️⃣ Auto-expel invalid tokens
  useEffect(() => {
    if (!token) return;
    fetch("http://localhost:8000/messages/?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    }).then((res) => {
      if (res.status === 401) {
        sessionStorage.removeItem("token");
        setToken("");
      }
    });
  }, [token]);

  // 1️⃣ Fetch available rooms on login
  useEffect(() => {
    if (!token) return;

    fetch("http://localhost:8000/rooms/", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not load rooms");
        return res.json();
      })
      .then((data) => {
        const names = data.map((r) => r.name);
        setRooms(names);
        // if no room selected yet, pick the first
        if (!room && names.length > 0) {
          setRoom(names[0]);
        }
      })
      .catch(console.error);
  }, [token]);

  // 2️⃣ Fetch chat history on login or room change
  useEffect(() => {
    if (!token || !room) return;

    fetch(
      `http://localhost:8000/messages/?skip=0&limit=100&room=${encodeURIComponent(
        room
      )}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
      .then((res) => {
        if (!res.ok) throw new Error("Could not load messages");
        return res.json();
      })
      .then((msgs) => {
        setMessages(msgs);
      })
      .catch(console.error);
  }, [token, room]);

  // 3️⃣ Open WebSocket for new messages
  useEffect(() => {
    if (!token || !room) return;

    const url = `ws://localhost:8000/ws/${room}?token=${encodeURIComponent(
      token
    )}`;
    console.log("Connecting WS to", url);

    ws.current = new WebSocket(url);
    ws.current.onopen = () => console.log("WebSocket connected");
    ws.current.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        setMessages((prev) => [...prev, msg]);
      } catch {
        console.warn("Ignored non-JSON:", evt.data);
      }
    };
    ws.current.onclose = (e) =>
      console.log("WebSocket closed", e.code, e.reason);
    ws.current.onerror = (err) => console.error("WebSocket error", err);

    return () => {
      if (ws.current) ws.current.close();
    };
  }, [token, room]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  // Sign up
  const handleSignup = async () => {
    setAuthError("");
    try {
      const res = await fetch("http://localhost:8000/rooms/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: prompt("New room name:") }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Room creation failed");
      }
      const newRoom = await res.json();
      setRooms((rs) => [...rs, newRoom.name]);
      setRoom(newRoom.name);
    } catch (e) {
      console.error(e);
      setAuthError(e.message);
    }
  };

  // Log in
  const handleLogin = async () => {
    setAuthError("");
    try {
      const res = await fetch("http://localhost:8000/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `username=${encodeURIComponent(
          loginUser
        )}&password=${encodeURIComponent(loginPass)}`,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Login failed");
      }
      const { access_token } = await res.json();
      sessionStorage.setItem("token", access_token);
      setToken(access_token);
      setMessages([]); // clear old history
    } catch (e) {
      console.error(e);
      setAuthError(e.message);
    }
  };

  // Send a chat message
  const sendMessage = () => {
    if (!input.trim() || ws.current.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({ content: input }));
    setInput("");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // If not logged in in this tab, show login/signup form
  if (!token) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Login / Sign Up</h2>
        {authError && <p style={{ color: "red" }}>{authError}</p>}
        <div style={{ marginBottom: 10 }}>
          <input
            placeholder="Username"
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
            style={{ marginRight: 10 }}
          />
          <input
            type="password"
            placeholder="Password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
          />
        </div>
        <button onClick={handleLogin} style={{ marginRight: 10 }}>
          Log In
        </button>
        <button onClick={async () => {
          // sign up by hitting the signup endpoint
          const name = loginUser.trim();
          const pass = loginPass;
          if (!name || !pass) {
            setAuthError("Enter both username and password to sign up");
            return;
          }
          try {
            const res = await fetch("http://localhost:8000/users/", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ username: name, password: pass }),
            });
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.detail || "Signup failed");
            }
            await handleLogin();
          } catch (e) {
            console.error(e);
            setAuthError(e.message);
          }
        }}>
          Sign Up
        </button>
      </div>
    );
  }

  // Otherwise show the chat UI
  return (
    <div style={{ padding: 20 }}>
      {/* Log Out */}
      <button
        onClick={() => {
          sessionStorage.removeItem("token");
          setToken("");
          setRoom("");
          setRooms([]);
        }}
        style={{ float: "right", marginBottom: 10 }}
      >
        Log Out
      </button>

      <h1>Chat App</h1>

      {/* Room Picker */}
      <div style={{ marginBottom: 15 }}>
        {rooms.map((r) => (
          <button
            key={r}
            onClick={() => {
              setRoom(r);
              setMessages([]); // clear when switching
            }}
            style={{
              marginRight: 5,
              padding: "5px 10px",
              backgroundColor: r === room ? "#007bff" : "#ccc",
              color: r === room ? "#fff" : "#000",
            }}
          >
            {r}
          </button>
        ))}
        <button onClick={handleSignup}>+ New Room</button>
      </div>

      <h2>Room: {room}</h2>

      {/* Messages */}
      <div
        style={{
          border: "1px solid #ccc",
          height: 300,
          overflowY: "auto",
          padding: 10,
          marginBottom: 10,
        }}
      >
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 5 }}>
            <strong>{m.username}:</strong> {m.content}{" "}
            <em style={{ fontSize: "0.8em", color: "#666" }}>
              {new Date(m.timestamp).toLocaleTimeString()}
            </em>
          </div>
        ))}
      </div>

      {/* Input & Send */}
      <div>
        <input
          style={{ width: "70%", marginRight: 10 }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default App;
