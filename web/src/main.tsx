import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Start } from "./Start.tsx";
import { Creating } from "./Creating.tsx";
import { Game } from "./Game.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/adventure/:id" element={<Creating />} />
        <Route path="/play/:scenarioId" element={<Game />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
