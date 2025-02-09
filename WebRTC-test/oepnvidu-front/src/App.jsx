import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LayOut from "./LayOut";
import BattleRoomPage from "./page/BattleRoomPage";

function App() {
return (
  <Router>
    <Routes>
      <Route index element={<LayOut />} />
      <Route path="battle-room/:battleId" element={<BattleRoomPage />} />
    </Routes>
  </Router>
);
}

export default App;
