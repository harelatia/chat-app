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
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ListItemText,
  Divider
} from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import SendIcon from "@mui/icons-material/Send";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import EmojiEmotionsIcon from "@mui/icons-material/EmojiEmotions";
import EmojiPicker from "emoji-picker-react";

// Determine backend URL
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
  // Auth
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Chat
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);

  // Friends & requests
  const [friends, setFriends] = useState([]);
  const [friendToAdd, setFriendToAdd] = useState("");
  const [showAddFriendDialog, setShowAddFriendDialog] = useState(false);
  const [requests, setRequests] = useState([]);

  const socketRef = useRef();
  const messagesEndRef = useRef(null);

  // Fetch incoming friend requests
  useEffect(() => {
    if (!isLoggedIn) return;
    fetch(`${SOCKET_SERVER_URL}/friend_requests/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(setRequests)
      .catch(console.error);
  }, [isLoggedIn, token]);

  // Fetch confirmed friends
  useEffect(() => {
    if (!isLoggedIn) return;
    fetch(`${SOCKET_SERVER_URL}/friends/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(setFriends)
      .catch(console.error);
  }, [isLoggedIn, token]);

  // Sign up

  // helper to set the room, load its history, then open the socket
  const enterRoom = async (roomName) => {
    setRoom(roomName);

  // 1) load history
    try {
      const res = await fetch(
        `${SOCKET_SERVER_URL}/messages/?room=${roomName}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const past = await res.json();
        setMessages(
          past.map(m => ({
            sender:    m.username,
            text:      m.content,
            timestamp: m.timestamp
          }))
        );
      }
    } catch (err) {
      console.error("History load failed:", err);
    }

    // 2) actually join the socket channel
    setJoined(true);
  };


  const handleSignup = async e => {
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

  // Log in
  const handleLogin = async e => {
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

  // Send friend request to user
  const handleSendFriendRequest = async uname => {
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

  const handleRemoveFriend = async uname => {
    const res = await fetch(
      `${SOCKET_SERVER_URL}/friends/${uname}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) return alert("Could not remove friend");
    // update local list
    setFriends(f => f.filter(x => x.username !== uname));
  };

  // Respond to friend request
  const handleRespond = async (id, action) => {
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
    if (!res.ok) return alert("Failed to respond to request");
    // remove from requests list
    setRequests(reqs => reqs.filter(r => r.id !== id));
    // refresh friends if accepted
    if (action === "accept") {
      fetch(`${SOCKET_SERVER_URL}/friends/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(setFriends)
        .catch(console.error);
    }
  };

  // Join room and load history
  const handleJoinRoom = e => {
  e.preventDefault();
  if (!room.trim()) return;
  enterRoom(room);
};


  // Handle typing
  const handleType = e => {
    const txt = e.target.value;
    setMessage(txt);
    if (socketRef.current) {
      if (txt) socketRef.current.emit("typing", { room, user: username });
      else socketRef.current.emit("stop_typing", { room, user: username });
    }
  };

  // Send message
  const handleSend = e => {
    e.preventDefault();
    if (!message.trim()) return;
    socketRef.current.emit("send_message", { text: message });
    setMessage("");
    setShowEmoji(false);
  };

  // Leave room
  const handleLeave = () => {
    socketRef.current.disconnect();
    setJoined(false);
    setRoom("");
    setMessages([]);
    setUsers([]);
    setTypingUsers([]);
  };

  // Socket.IO setup
  useEffect(() => {
    if (!joined) return;
    const socket = io(SOCKET_SERVER_URL, { auth: { token, room } });
    socketRef.current = socket;
    socket.on("connect", () => console.log(`Connected ${socket.id} to ${room}`));
    socket.on("receive_message", msg => setMessages(prev => [...prev, msg]));
    socket.on("room_users", list => setUsers(list));
    socket.on("typing", ({ user }) =>
      setTypingUsers(prev => Array.from(new Set([...prev, user])))
    );
    socket.on("stop_typing", ({ user }) =>
      setTypingUsers(prev => prev.filter(u => u !== user))
    );
    return () => socket.disconnect();
  }, [joined, room, token]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Render login/signup
  if (!isLoggedIn) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
          <Paper sx={{ p: 4, width: 360 }} elevation={3}>
            <Typography variant="h6" gutterBottom>
              {isSignup ? "Sign Up" : "Log In"}
            </Typography>
            <Box component="form" onSubmit={isSignup ? handleSignup : handleLogin} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField label="Username" value={username} onChange={e => setUsername(e.target.value)} required />
              <TextField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              <Button type="submit" variant="contained">{isSignup ? "Sign Up" : "Log In"}</Button>
            </Box>
            <Button onClick={() => setIsSignup(v => !v)} sx={{ mt: 2 }} size="small">
              {isSignup ? "Have an account? Log In" : "New here? Sign Up"}
            </Button>
          </Paper>
        </Box>
      </ThemeProvider>
    );
  }

  // Render join-room + friends + requests
  if (!joined) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
          <Paper sx={{ p: 4, width: 360 }} elevation={3}>
            <Typography variant="h6" gutterBottom>Enter Chat Room</Typography>
            <Box component="form" onSubmit={handleJoinRoom} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField label="Room Name" value={room} onChange={e => setRoom(e.target.value)} required helperText="Type to create or pick" />
              <Button type="submit" variant="contained">Join Room</Button>
            </Box>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1">Friend Requests</Typography>
            <List>
              {requests.map(r => (
                <ListItem key={r.id} sx={{ display: "flex", alignItems: "center" }}>
                  <ListItemText primary={`${r.from_username} wants to be friends`} />
                  <Button size="small" onClick={() => handleRespond(r.id, "accept")}>Accept</Button>
                  <Button size="small" color="error" onClick={() => handleRespond(r.id, "reject")}>Reject</Button>
                </ListItem>
              ))}
            </List>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1">Your Friends</Typography>
            <List>
              {friends.map(f => (
                <ListItem key={f.username} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <ListItemText primary={f.username} />
                  <Box>
                    <Button size="small" onClick={() => enterRoom(f.room_name)}>
                      Chat
                    </Button>
                    <Button size="small" color="error" onClick={() => handleRemoveFriend(f.username)}>
                      Remove
                    </Button>
                  </Box>
                </ListItem>
              ))}
            </List>
            <Button onClick={() => setShowAddFriendDialog(true)} startIcon={<PersonAddIcon />} variant="outlined" sx={{ mt: 2 }}>
              Add Friend
            </Button>
            <Dialog open={showAddFriendDialog} onClose={() => setShowAddFriendDialog(false)}>
              <DialogTitle>Add a Friend</DialogTitle>
              <DialogContent>
                <TextField autoFocus margin="dense" label="Username" fullWidth value={friendToAdd} onChange={e => setFriendToAdd(e.target.value)} />
              </DialogContent>
              <DialogActions>
                <Button onClick={() => setShowAddFriendDialog(false)}>Cancel</Button>
                <Button onClick={() => {
                  handleSendFriendRequest(friendToAdd);
                  setShowAddFriendDialog(false);
                }}>Add</Button>
              </DialogActions>
            </Dialog>
          </Paper>
        </Box>
      </ThemeProvider>
    );
  }

  // Render chat view
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <AppBar position="static">
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>Room: {room}</Typography>
            <IconButton color="inherit" onClick={handleLeave}>
              <ExitToAppIcon />
            </IconButton>
            <Typography variant="body2" sx={{ mx: 2 }}>Users: {users.join(", ")}</Typography>
            <Typography variant="caption" sx={{ fontStyle: "italic" }}>
              {typingUsers.length ? `${typingUsers.join(", ")} typing…` : ""}
            </Typography>
          </Toolbar>
        </AppBar>
        <Box sx={{ flex: 1, overflowY: "auto", bgcolor: "background.default", p: 2 }}>
          <List>
            {messages.map((msg, i) => (
              <ListItem key={i} sx={{ justifyContent: msg.sender === username ? "flex-end" : "flex-start" }}>
                <Paper elevation={1} sx={{ p: 1, borderRadius: 2, bgcolor: msg.sender === username ? "primary.main" : "grey.300", color: msg.sender === username ? "primary.contrastText" : "text.primary", maxWidth: "75%" }}>
                  <Typography variant="caption" display="block">
                    {msg.sender} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Typography>
                  <Typography variant="body1">{msg.text}</Typography>
                </Paper>
              </ListItem>
            ))}
            <div ref={messagesEndRef} />
          </List>
        </Box>
        <Box component="form" onSubmit={handleSend} sx={{ p: 1, bgcolor: "background.paper", display: "flex", alignItems: "center" }}>
          <IconButton onClick={() => setShowEmoji(v => !v)}>
            <EmojiEmotionsIcon />
          </IconButton>
          {showEmoji && <EmojiPicker onEmojiClick={emojiData => setMessage(m => m + emojiData.emoji)} />}
          <TextField fullWidth placeholder="Type a message…" value={message} onChange={handleType} sx={{ bgcolor: "white", borderRadius: 1, mx: 1 }} />
          <IconButton type="submit" color="primary"><SendIcon /></IconButton>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
