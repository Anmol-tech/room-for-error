import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Start } from "./Start.tsx";
import { Creating } from "./Creating.tsx";
import { Game } from "./Game.tsx";
import { Preview } from "./Preview.tsx";
import { ExploreEntry } from "./ExploreEntry.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Start />} />
        <Route path="/adventure/:id" element={<Creating />} />
        {/* The trailing part names the current room in test mode (see Game), so Kane sees each room as its own screen. */}
        <Route path="/play/:scenarioId/*" element={<Game />} />
        <Route path="/preview/:runId" element={<Preview />} />
        <Route path="/explore/:scenarioId" element={<ExploreEntry />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
