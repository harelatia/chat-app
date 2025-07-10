import React, { useState } from "react";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import { Box, TextField, Button, List, ListItem, ListItemText } from "@mui/material";

// Determine the backend URL
const API_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : process.env.REACT_APP_SOCKET_SERVER_URL;

export default function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);

  const doSearch = async () => {
    if (!q.trim()) return;
    const token = localStorage.getItem("token");
    try {
      const res = await fetch(
        `${API_URL}/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        console.error("Search error", res.status, await res.text());
        return;
      }
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error("Search failed", err);
    }
  };

  const jumpToMessage = (id) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.transition = "background-color 0.5s ease";
    el.style.backgroundColor = "rgba(255,243,128,0.7)";
    setTimeout(() => (el.style.backgroundColor = ""), 2000);
  };

  return (
    <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          fullWidth
          label="Search messages…"
          size="small"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button variant="contained" onClick={doSearch}>
          Search
        </Button>
      </Box>

      {results.length > 0 && (
        <ClickAwayListener onClickAway={() => setResults([])}>
          <List sx={{ mt: 2, bgcolor: "background.paper" }}>
            {results.map((msg) => (
              <ListItem
                key={msg.id}
                alignItems="flex-start"
                secondaryAction={
                  <Button size="small" onClick={() => jumpToMessage(msg.id)}>
                    Go
                  </Button>
                }
              >
                <ListItemText
                  primary={`${msg.username} • ${new Date(msg.timestamp + "Z").toLocaleString()}`}
                  secondary={msg.content}
                  primaryTypographyProps={{ variant: "body2", color: "textSecondary" }}
                  secondaryTypographyProps={{ variant: "body1", color: "textPrimary" }}
                />
              </ListItem>
            ))}
          </List>
        </ClickAwayListener>
      )}
    </Box>
  );
}
