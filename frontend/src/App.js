import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Snackbar,
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import SendIcon from "@mui/icons-material/Send";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import EmojiEmotionsIcon from "@mui/icons-material/EmojiEmotions";
import EmojiPicker from "emoji-picker-react";

const SOCKET_SERVER_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : process.env.REACT_APP_SOCKET_SERVER_URL;

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1976d2" },
    background: { default: "#f4f7f9", paper: "#ffffff" },
  },
});

export default function App() {
  // — Persisted auth & room state —
  const [username, setUsername] = useState(
    () => localStorage.getItem("username") || ""
  );
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(
    () => localStorage.getItem("token") || ""
  );
  const [isSignup, setIsSignup] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => !!localStorage.getItem("token")
  );

  const [room, setRoom] = useState(
    () => localStorage.getItem("room") || ""
  );
  const [joined, setJoined] = useState(
    () => localStorage.getItem("joined") === "true"
  );

  // — Ephemeral UI state —
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);

  // — Friends & requests —
  const [friends, setFriends] = useState([]);
  const [friendToAdd, setFriendToAdd] = useState("");
  const [showAddFriendDialog, setShowAddFriendDialog] = useState(false);
  const [requests, setRequests] = useState([]);

  // — Rooms & invites —
  const [rooms, setRooms] = useState([]);
  const [roomInvites, setRoomInvites] = useState([]);
  const [showCreateRoomDialog, setShowCreateRoomDialog] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [createInviteUsername, setCreateInviteUsername] = useState("");

  // — Invite in-chat dialog —
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");

  // — In-app toast/snackbar —
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState("");

  // — Socket refs & scrolling ref —
  const socketRef = useRef();
  const notifSocketRef = useRef(null);
  const messagesEndRef = useRef();

useEffect(() => {
  if (!isLoggedIn) return;
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }

  console.log("🔔 setting up background notification socket…");
  const sock = io(SOCKET_SERVER_URL, { auth: { token } });
  notifSocketRef.current = sock;

  sock.on("connect", async () => {
    console.log("🔔 notification socket connected, id=", sock.id);

    // join private rooms
    try {
      const flist = await fetch(`${SOCKET_SERVER_URL}/friends/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      flist.forEach(f => sock.emit("join_room", f.room_name));
    } catch (e) {
      console.error("🔔 failed to fetch friends:", e);
    }

    // join group rooms
    try {
      const glist = await fetch(`${SOCKET_SERVER_URL}/rooms/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json());
      glist.forEach(rm => sock.emit("join_room", rm.name));
    } catch (e) {
      console.error("🔔 failed to fetch rooms:", e);
    }
  });

  sock.on("receive_message", msg => {
    console.log("🔔 background got message", msg);
    if (msg.sender === username) return;
    if (Notification.permission === "granted") {
      new Notification(`📬 ${msg.sender}`, { body: msg.text });
    }
    setNotifyMsg(`${msg.sender}: ${msg.text}`);
    setNotifyOpen(true);
  });

  sock.on("disconnect", () => {
    console.log("🔔 notification socket disconnected");
  });

  return () => {
    console.log("🔔 tearing down notification socket…");
    sock.disconnect();
    notifSocketRef.current = null;
  };
}, [isLoggedIn, token, username]);

  useEffect(() => {
    localStorage.setItem("joined", joined);
    if (joined) localStorage.setItem("room", room);
    else localStorage.removeItem("room");
  }, [joined, room]);

  // — Notification permission —
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // — Fetch friend-requests —
  useEffect(() => {
    if (!isLoggedIn) return;
    fetch(`${SOCKET_SERVER_URL}/friend_requests/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setRequests(d) : setRequests([])))
      .catch(() => setRequests([]));
  }, [isLoggedIn, token]);

  // — Fetch friends —
  useEffect(() => {
    if (!isLoggedIn) return;
    fetch(`${SOCKET_SERVER_URL}/friends/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setFriends(d))
      .catch(console.error);
  }, [isLoggedIn, token]);

  useEffect(() => {
  if (isLoggedIn) {
    localStorage.setItem("token", token);
    localStorage.setItem("username", username);
  } else {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
  }
}, [isLoggedIn, token, username]);

  useEffect(() => {
  if (!notifSocketRef.current) return;
  const sock = notifSocketRef.current;

  sock.on("friend_removed", ({ by }) => {
    // drop them out of our friends list
    setFriends(fs => fs.filter(f => f.username !== by));
  });

  return () => {
    sock.off("friend_removed");
  };
}, [notifSocketRef.current]);


  // — Fetch rooms & room-invites —
  useEffect(() => {
    if (!isLoggedIn) return;
    // your rooms
    fetch(`${SOCKET_SERVER_URL}/rooms/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setRooms(d))
      .catch(console.error);

    // invites
    fetch(`${SOCKET_SERVER_URL}/room_invites/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setRoomInvites(d) : setRoomInvites([])))
      .catch(() => setRoomInvites([]));
  }, [isLoggedIn, token]);

  // — Handlers for login/signup/log-out —
  const handleSignup = async (e) => {
    e.preventDefault();
    const res = await fetch(`${SOCKET_SERVER_URL}/users/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) return alert("Signup failed");
    alert("Signup succeeded—please log in");
    setIsSignup(false);
  };
  const handleLogin = async (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    params.append("username", username);
    params.append("password", password);
    const res = await fetch(`${SOCKET_SERVER_URL}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    if (!res.ok) return alert("Login failed");
    const data = await res.json();
    setToken(data.access_token);
    setIsLoggedIn(true);
  };
  const handleLogout = () => {
    setIsLoggedIn(false);
    setToken("");
    setUsername("");
    setJoined(false);
    setRoom("");
    setMessages([]);
    setUsers([]);
    setTypingUsers([]);
    setFriends([]);
    setRequests([]);
    setRooms([]);
    setRoomInvites([]);
  };

  // — Enter / leave room —
  const enterRoom = (rn) => {
    setRoom(rn);
    setJoined(true);
    setMessages([]);
    setUsers([]);
    setTypingUsers([]);
  };
  const handleLeave = () => {
    socketRef.current?.disconnect();
    setJoined(false);
    setRoom("");
    setMessages([]);
    setUsers([]);
    setTypingUsers([]);
  };

  // — Friend actions —
  const handleSendFriendRequest = async (uname) => {
    const res = await fetch(`${SOCKET_SERVER_URL}/friend_requests/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to_username: uname }),
    });
    if (!res.ok) return alert("Could not send friend request");
    alert("Friend request sent!");
    setFriendToAdd("");
  };
  const handleRemoveFriend = async (uname) => {
    const res = await fetch(`${SOCKET_SERVER_URL}/friends/${uname}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return alert("Could not remove friend");
    setFriends((f) => f.filter((x) => x.username !== uname));
  };
  const handleRespondFriend = async (id, action) => {
    const res = await fetch(
      `${SOCKET_SERVER_URL}/friend_requests/${id}/respond`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      }
    );
    if (!res.ok) return alert("Failed to respond");
    setRequests((r) => r.filter((x) => x.id !== id));
    if (action === "accept") {
      fetch(`${SOCKET_SERVER_URL}/friends/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => Array.isArray(d) && setFriends(d))
        .catch(console.error);
    }
  };

  // — Leave a group room —
  const handleLeaveGroup = async (roomName) => {
    const res = await fetch(
      `${SOCKET_SERVER_URL}/rooms/${encodeURIComponent(roomName)}/leave`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) {
      return alert("Could not leave room");
    }
    // re-fetch your room list so the UI stays in sync
    const data = await fetch(`${SOCKET_SERVER_URL}/rooms/`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => r.json());
    setRooms(Array.isArray(data) ? data : []);
  };

  // — Create Room & optional invite —
  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) {
      return alert("Room name is required");
    }
    // 1) create
    const r1 = await fetch(`${SOCKET_SERVER_URL}/rooms/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: newRoomName }),
    });
    if (!r1.ok) return alert("Could not create room");
    // 2) optional invite
    if (createInviteUsername.trim()) {
      const r2 = await fetch(`${SOCKET_SERVER_URL}/room_invites/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          room_name: newRoomName,
          to_username: createInviteUsername,
        }),
      });
      if (!r2.ok) alert("Room created but invite failed");
    }
    // 3) refresh lists
    const [allRooms, invs] = await Promise.all([
      fetch(`${SOCKET_SERVER_URL}/rooms/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
      fetch(`${SOCKET_SERVER_URL}/room_invites/`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json()),
    ]);
    Array.isArray(allRooms) && setRooms(allRooms);
    Array.isArray(invs) && setRoomInvites(invs);
    setShowCreateRoomDialog(false);
    setNewRoomName("");
    setCreateInviteUsername("");
  };

  // — Respond to room invite —
  const handleRespondRoomInvite = async (id, action) => {
    const res = await fetch(
      `${SOCKET_SERVER_URL}/room_invites/${id}/respond`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      }
    );
    if (!res.ok) return alert("Failed to respond to room invite");
    setRoomInvites((r) => r.filter((x) => x.id !== id));
    if (action === "accept") {
      const data = await res.json();
      enterRoom(data.room_name);
    }
  };

  // — Join by typing room name —
  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!room.trim()) return;
    enterRoom(room);
  };

  // — Typing indicator —
  const handleType = (e) => {
    const txt = e.target.value;
    setMessage(txt);
    if (socketRef.current) {
      if (txt)
        socketRef.current.emit("typing", { room, user: username });
      else
        socketRef.current.emit("stop_typing", { room, user: username });
    }
  };

  // — Send message —
  const handleSend = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    socketRef.current.emit("send_message", { text: message });
    setMessage("");
    setShowEmoji(false);
  };

  // — Invite inside chat —
  const handleInvite = async () => {
    if (!inviteUsername.trim()) return alert("Username is required");
    const res = await fetch(`${SOCKET_SERVER_URL}/room_invites/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ room_name: room, to_username: inviteUsername }),
    });
    if (!res.ok) alert("Invite failed");
    else {
      alert("Invite sent");
      setInviteUsername("");
      setShowInviteDialog(false);
    }
  };

  // — Active chat socket + load history —
  useEffect(() => {
    if (!joined) return;

    fetch(`${SOCKET_SERVER_URL}/messages/?room=${room}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((past) => {
        setMessages(
          past.map((m) => ({
            sender: m.username,
            text: m.content,
            timestamp: m.timestamp,
          }))
        );
      })
      .catch(console.error);

    const socket = io(SOCKET_SERVER_URL, { auth: { token, room } });
    socketRef.current = socket;
    socket.on("receive_message", (msg) => {
      setMessages((p) => [...p, msg]);
      if (msg.sender !== username) {
        if (Notification.permission === "granted") {
          new Notification(`New from ${msg.sender}`, {
            body: msg.text,
          });
        }
        setNotifyMsg(`${msg.sender}: ${msg.text}`);
        setNotifyOpen(true);
      }
    });
    socket.on("room_users", (list) => setUsers(list));
    socket.on("typing", ({ user }) =>
      setTypingUsers((p) => [...new Set([...p, user])])
    );
    socket.on("stop_typing", ({ user }) =>
      setTypingUsers((p) => p.filter((u) => u !== user))
    );
    return () => socket.disconnect();
  }, [joined, room, token, username]);

  // auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  //
  // ─── RENDER ──────────────────────────────────────────
  //

  // 1) Login/Signup
  if (!isLoggedIn) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            display: "flex",
            height: "100vh",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Paper sx={{ p: 4, width: 360 }} elevation={3}>
            <Typography variant="h6" gutterBottom>
              {isSignup ? "Sign Up" : "Log In"}
            </Typography>
            <Box
              component="form"
              onSubmit={isSignup ? handleSignup : handleLogin}
              sx={{ display: "flex", flexDirection: "column", gap: 2 }}
            >
              <TextField
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" variant="contained">
                {isSignup ? "Sign Up" : "Log In"}
              </Button>
            </Box>
            <Button
              onClick={() => setIsSignup((v) => !v)}
              sx={{ mt: 2 }}
              size="small"
            >
              {isSignup
                ? "Have an account? Log In"
                : "New here? Sign Up"}
            </Button>
          </Paper>
        </Box>
        <Snackbar
          open={notifyOpen}
          autoHideDuration={4000}
          onClose={() => setNotifyOpen(false)}
          message={notifyMsg}
        />
      </ThemeProvider>
    );
  }

  // 2) Lobby: rooms, invites, friends…
  if (!joined) {
    const privateRooms = rooms.filter((r) =>
      r.name.startsWith("private_")
    );
    const groupRooms = rooms.filter(
      (r) => !r.name.startsWith("private_")
    );

    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            display: "flex",
            height: "100vh",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Paper sx={{ p: 4, width: 360 }} elevation={3}>
            {/* Create & Invite */}
            <Button
              startIcon={<PersonAddIcon />}
              variant="contained"
              onClick={() => setShowCreateRoomDialog(true)}
              sx={{ mb: 2 }}
            >
              Create Room & Invite
            </Button>
            <Dialog
              open={showCreateRoomDialog}
              onClose={() => setShowCreateRoomDialog(false)}
            >
              <DialogTitle>Create Room & Invite</DialogTitle>
              <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
                <TextField
                  label="Room Name"
                  fullWidth
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                />
                <TextField
                  label="Invite Username (optional)"
                  fullWidth
                  value={createInviteUsername}
                  onChange={(e) =>
                    setCreateInviteUsername(e.target.value)
                  }
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setShowCreateRoomDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateRoom}>
                  Create & Invite
                </Button>
              </DialogActions>
            </Dialog>
            <Button
              startIcon={<PersonAddIcon />}
              variant="outlined"
              onClick={() => setShowAddFriendDialog(true)}
            sx={{ mb: 2 }}
            >
              Add Friend
            </Button>
            <Dialog
              open={showAddFriendDialog}
              onClose={() => setShowAddFriendDialog(false)}
            >
              <DialogTitle>Add a Friend</DialogTitle>
              <DialogContent>
                <TextField
                  autoFocus
                  margin="dense"
                  label="Username"
                  fullWidth
                  value={friendToAdd}
                  onChange={e => setFriendToAdd(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setShowAddFriendDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={() => {
                  handleSendFriendRequest(friendToAdd);
                  setShowAddFriendDialog(false);
                }}>
                  Add
                </Button>
              </DialogActions>
            </Dialog>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1">Group Rooms</Typography>
            <List>
              {groupRooms.map((r) => (
                <ListItem
                  key={r.name}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <ListItemText
                    primary={r.name}
                    onClick={() => enterRoom(r.name)}
                    sx={{ cursor: "pointer" }}
                  />
                  <Button
                    size="small"
                    color="error"
                    onClick={() => handleLeaveGroup(r.name)}
                  >
                    Leave
                  </Button>
                </ListItem>
              ))}
            </List>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1">Room Invitations</Typography>
            <List>
              {roomInvites.map((inv) => (
                <ListItem
                  key={inv.id}
                  sx={{ display: "flex", alignItems: "center" }}
                >
                  <ListItemText
                    primary={`${inv.from_username} → “${inv.room_name}”`}
                  />
                  <Button
                    size="small"
                    onClick={() =>
                      handleRespondRoomInvite(inv.id, "accept")
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      handleRespondRoomInvite(inv.id, "reject")
                    }
                  >
                    Reject
                  </Button>
                </ListItem>
              ))}
            </List>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1">Friend Requests</Typography>
            <List>
              {requests.map((r) => (
                <ListItem
                  key={r.id}
                  sx={{ display: "flex", alignItems: "center" }}
                >
                  <ListItemText
                    primary={`${r.from_username} wants to be friends`}
                  />
                  <Button
                    size="small"
                    onClick={() =>
                      handleRespondFriend(r.id, "accept")
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    onClick={() =>
                      handleRespondFriend(r.id, "reject")
                    }
                  >
                    Reject
                  </Button>
                </ListItem>
              ))}
            </List>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1">Your Friends</Typography>
            <List>
              {friends.map((f) => (
                <ListItem
                  key={f.username}
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <ListItemText primary={f.username} />
                  <Box>
                    <Button
                      size="small"
                      onClick={() => enterRoom(f.room_name)}
                    >
                      Chat
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() =>
                        handleRemoveFriend(f.username)
                      }
                    >
                      Remove
                    </Button>
                  </Box>
                </ListItem>
              ))}
            </List>

            <Button
              onClick={handleLogout}
              variant="text"
              sx={{ mt: 2 }}
            >
              Log Out
            </Button>

            <Snackbar
              open={notifyOpen}
              autoHideDuration={4000}
              onClose={() => setNotifyOpen(false)}
              message={notifyMsg}
            />
          </Paper>
        </Box>
      </ThemeProvider>
    );
  }

  // 3) CHAT VIEW
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Room: {room}
            </Typography>
            <IconButton
              color="inherit"
              onClick={() => setShowInviteDialog(true)}
            >
              <PersonAddIcon />
            </IconButton>
            <Dialog
              open={showInviteDialog}
              onClose={() => setShowInviteDialog(false)}
            >
              <DialogTitle>Invite to “{room}”</DialogTitle>
              <DialogContent>
                <TextField
                  label="Username"
                  fullWidth
                  value={inviteUsername}
                  onChange={(e) =>
                    setInviteUsername(e.target.value)
                  }
                />
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={() => setShowInviteDialog(false)}
                >
                  Cancel
                </Button>
                <Button onClick={handleInvite}>Invite</Button>
              </DialogActions>
            </Dialog>

            <IconButton color="inherit" onClick={handleLeave}>
              <ExitToAppIcon />
            </IconButton>
            <Typography variant="body2" sx={{ mx: 2 }}>
              Users: {users.join(", ")}
            </Typography>
            <Typography variant="caption" sx={{ fontStyle: "italic" }}>
              {typingUsers.length ? `${typingUsers.join(", ")} typing…` : ""}
            </Typography>
          </Toolbar>
        </AppBar>

        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            bgcolor: "background.default",
            p: 2,
          }}
        >
          <List>
            {messages.map((msg, i) => (
              <ListItem
                key={i}
                sx={{
                  justifyContent:
                    msg.sender === username ? "flex-end" : "flex-start",
                }}
              >
                <Paper
                  elevation={1}
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    bgcolor:
                      msg.sender === username ? "primary.main" : "grey.300",
                    color:
                      msg.sender === username
                        ? "primary.contrastText"
                        : "text.primary",
                    maxWidth: "75%",
                  }}
                >
                  <Typography variant="caption" display="block">
                    {msg.sender} •{" "}
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Typography>
                  <Typography variant="body1">{msg.text}</Typography>
                </Paper>
              </ListItem>
            ))}
            <div ref={messagesEndRef} />
          </List>
        </Box>

        <Box
          component="form"
          onSubmit={handleSend}
          sx={{
            p: 1,
            bgcolor: "background.paper",
            display: "flex",
            alignItems: "center",
          }}
        >
          <IconButton onClick={() => setShowEmoji((v) => !v)}>
            <EmojiEmotionsIcon />
          </IconButton>
          {showEmoji && (
            <EmojiPicker onEmojiClick={(e) => setMessage((m) => m + e.emoji)} />
          )}
          <TextField
            fullWidth
            placeholder="Type a message…"
            value={message}
            onChange={handleType}
            sx={{
              bgcolor: "white",
              borderRadius: 1,
              mx: 1,
            }}
          />
          <IconButton type="submit" color="primary">
            <SendIcon />
          </IconButton>
        </Box>

        <Snackbar
          open={notifyOpen}
          autoHideDuration={4000}
          onClose={() => setNotifyOpen(false)}
          message={notifyMsg}
        />
      </Box>
    </ThemeProvider>
  );
}
