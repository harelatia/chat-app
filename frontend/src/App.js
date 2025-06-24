import React, { useState, useEffect, useRef } from "react";
// use named import so query/auth are passed correctly
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
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";

// Allow overriding via env (especially when both frontend+backend are containerized)
const SOCKET_SERVER_URL =
  process.env.REACT_APP_SOCKET_SERVER_URL || "http://localhost:4000";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1976d2" },
    background: { default: "#f4f7f9", paper: "#ffffff" },
  },
});

export default function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [joined, setJoined] = useState(false);

  const socketRef = useRef();
  const messagesEndRef = useRef(null);

  // connect & join room via auth payload
  useEffect(() => {
    if (!joined) return;

    const socket = io(SOCKET_SERVER_URL, {
      // use auth instead of query to match server connect signature
      auth: { room },
      // fallback: CORS handled in backend config
    });
    socketRef.current = socket;

    socket.on("connect", () =>
      console.log(`🔌 Connected (${socket.id}) to room: '${room}'`)
    );
    socket.on("disconnect", reason =>
      console.log("🔌 Disconnected:", reason)
    );

    socket.on("receive_message", msg => {
      console.log("📥 receive_message:", msg);
      setMessages(prev => [...prev, msg]);
    });

    return () => {
      socket.disconnect();
    };
  }, [joined, room]);

  // auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleJoin = e => {
    e.preventDefault();
    if (username.trim() && room.trim()) {
      setMessages([]);
      setJoined(true);
    }
  };

  const handleSend = e => {
    e.preventDefault();
    if (!message.trim()) return;

    const msgObj = { sender: username, text: message };
    socketRef.current.emit("send_message", msgObj);
    setMessages(prev => [...prev, msgObj]);
    setMessage("");
  };

  const handleLeave = () => {
    socketRef.current?.disconnect();
    setJoined(false);
    setRoom("");
    setMessages([]);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {!joined ? (
        <Box sx={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center" }}>
          <Paper sx={{ p: 4, width: 360 }} elevation={3}>
            <Typography variant="h6" gutterBottom>
              Join or Create Chat Room
            </Typography>
            <Box component="form" onSubmit={handleJoin} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="Username"
                variant="outlined"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
              />
              <TextField
                label="Room Name"
                variant="outlined"
                value={room}
                onChange={e => setRoom(e.target.value)}
                required
                helperText="Type a name to create, or choose an existing one"
              />
              <TextField
                label="Password"
                type="password"
                variant="outlined"
                value={password}
                onChange={e => setPassword(e.target.value)}
                helperText="Optional – only if room is protected"
              />
              <Button type="submit" variant="contained">
                Enter Room
              </Button>
            </Box>
          </Paper>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
          <AppBar position="static">
            <Toolbar>
              <Typography variant="h6" sx={{ flexGrow: 1 }}>
                Room: {room}
              </Typography>
              <Typography variant="subtitle1" sx={{ mr: 2 }}>
                {username}
              </Typography>
              <IconButton color="inherit" onClick={handleLeave}>
                <ExitToAppIcon />
              </IconButton>
            </Toolbar>
          </AppBar>

          <Box sx={{ flex: 1, overflowY: "auto", bgcolor: "background.default", p: 2 }}>
            <List>
              {messages.map((msg, idx) => (
                <ListItem key={idx} sx={{ justifyContent: msg.sender === username ? "flex-end" : "flex-start" }}>
                  <Box
                    sx={{
                      maxWidth: "75%",
                      p: 1,
                      borderRadius: 2,
                      bgcolor: msg.sender === username ? "primary.main" : "grey.300",
                      color: msg.sender === username ? "primary.contrastText" : "text.primary",
                    }}
                  >
                    <ListItemText primary={msg.text} secondary={msg.sender} />
                  </Box>
                </ListItem>
              ))}
              <div ref={messagesEndRef} />
            </List>
          </Box>

          <Box component="form" onSubmit={handleSend} sx={{ display: "flex", p: 1, bgcolor: "background.paper" }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Type a message..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              sx={{ bgcolor: "white", borderRadius: 1 }}
            />
            <IconButton type="submit" color="primary" sx={{ ml: 1 }}>
              <SendIcon />
            </IconButton>
          </Box>
        </Box>
      )}
    </ThemeProvider>
  );
}
