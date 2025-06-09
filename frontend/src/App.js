import React, { useState, useEffect, useRef } from "react";

function App() {
  // ── Auth state (per-tab) ─────────────────────────────────────────────────
  const [token, setToken] = useState(sessionStorage.getItem("token") || "");
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [authError, setAuthError] = useState("");

  // ── Chat state ───────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [room] = useState("general");
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

  // 1️⃣ Fetch chat history on login or room change
  useEffect(() => {
    if (!token) return;

    fetch(`http://localhost:8000/messages/?skip=0&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not load messages");
        return res.json();
      })
      .then((msgs) => {
        const roomMsgs = msgs.filter((m) => m.room === room);
        setMessages(roomMsgs);
      })
      .catch((err) => console.error(err));
  }, [token, room]);

  // 2️⃣ Open WebSocket for new messages
  useEffect(() => {
    if (!token) return;

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
      const res = await fetch("http://localhost:8000/users/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Signup failed");
      }
      await handleLogin(); // auto-login
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
    console.log("Sending:", input);
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
        <button onClick={handleSignup}>Sign Up</button>
      </div>
    );
  }

  // Otherwise, show the chat UI
  return (
    <div style={{ padding: 20 }}>
      <button
        onClick={() => {
          sessionStorage.removeItem("token");
          setToken("");
        }}
        style={{ float: "right", marginBottom: 10 }}
      >
        Log Out
      </button>

      <h1>Chat App — Room: {room}</h1>

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
