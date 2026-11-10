import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/fraunces";
import "./styles.css";
import "./production.css";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("The root application element was not found.");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode><App /></React.StrictMode>,
);
