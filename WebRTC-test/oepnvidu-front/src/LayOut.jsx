import { useNavigate } from "react-router-dom";
import { useBattleStore } from "./store";
import { useState } from "react";

function LayOut() {
  const navigate = useNavigate();
  const setBattleInfo = useBattleStore((state) => state.setBattleInfo);
  const [myNickName, setMyNickName] = useState("");
  const [roomTitle, setRoomTitle] = useState("");

  const createBattleRoomHandler = async (e) => {
    e.preventDefault();

    try {
      // store에 배틀 정보 저장하기 전에 데이터 확인
      console.log("Storing battle info:", {
        participantName: myNickName,
        roomName: roomTitle,
      });

      setBattleInfo({
        participantName: myNickName,
        roomName: roomTitle,
      });

      // store 업데이트 후 상태 확인
      const currentState = useBattleStore.getState();
      console.log("Current store state:", currentState);

      // 다른 페이지로 이동
      navigate(`/battle-room/${roomTitle}`, {
        state: {
          nickname: myNickName,
          roomTitle: roomTitle,
        },
      });
    } catch (error) {
      console.error("Battle room navigation error:", error);
    }
  };
  return (
    <>
      <h1>방에 참여하기</h1>
      <div id="join">
        <div id="join-dialog">
          <h2>Join a Video Room</h2>
          <form onSubmit={createBattleRoomHandler}>
            <div>
              <label htmlFor="participant-name">Participant</label>
              <input
                id="participant-name"
                className="form-control"
                type="text"
                value={myNickName}
                onChange={(e) => setMyNickName(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="room-name">Room</label>
              <input
                id="room-name"
                className="form-control"
                type="text"
                value={roomTitle}
                onChange={(e) => setRoomTitle(e.target.value)}
                required
              />
            </div>
            <button
              className="btn btn-lg btn-success"
              type="submit"
              disabled={!roomTitle || !myNickName}
            >
              Join!
            </button>
          </form>
        </div>
      </div>
    </>
  );
}

export default LayOut;
