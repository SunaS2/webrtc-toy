import { Room, RoomEvent } from "livekit-client";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBattleStore } from "../store";
import VideoComponent from "../components/VideoComponent";
import AudioComponent from "../components/AudioComponent";

let APPLICATION_SERVER_URL = "";
let LIVEKIT_URL = "";
configureUrls();

function configureUrls() {
  // If APPLICATION_SERVER_URL is not configured, use default value from OpenVidu Local deployment
  if (!APPLICATION_SERVER_URL) {
    if (window.location.hostname === "localhost") {
      APPLICATION_SERVER_URL = "http://localhost:6080/";
    } else {
      APPLICATION_SERVER_URL = "https://" + window.location.hostname + ":6443/";
    }
  }

  // If LIVEKIT_URL is not configured, use default value from OpenVidu Local deployment
  if (!LIVEKIT_URL) {
    if (window.location.hostname === "localhost") {
      LIVEKIT_URL = "ws://localhost:7880/";
    } else {
      LIVEKIT_URL = "wss://" + window.location.hostname + ":7443/";
    }
  }
}

function BattleRoomPage() {
  const battleInfo = useBattleStore((state) => state.battleInfo);
  const clearBattleInfo = useBattleStore((state) => state.clearBattleInfo);
  const { roomName, participantName, isMaster } = battleInfo;
  const navigate = useNavigate();

  // 방 객체 생성
  const [room, setRoom] = useState(null);
  // 로컬 비디오 트랙 객체 생성(내 카메라)
  const [localTrack, setLocalTrack] = useState(null);
  // 다른 참가자들의 비디오 트랙 객체 생성(여러명의 참가자 카메라)
  const [remoteTracks, setRemoteTracks] = useState([]);

  useEffect(() => {
    joinRoom();

    return () => {
      leaveRoom();
    };
  }, []);

  // BattleRoomPage에서 수정이 필요한 부분
  async function joinRoom() {
    const room = new Room();
    setRoom(room);

    room.on(RoomEvent.TrackSubscribed, (_track, publication, participant) => {
      setRemoteTracks((prev) => [
        ...prev,
        {
          trackPublication: publication,
          participantIdentity: participant.identity,
        },
      ]);
    });

    room.on(RoomEvent.TrackUnsubscribed, (_track, publication) => {
      setRemoteTracks((prev) =>
        prev.filter(
          (track) => track.trackPublication.trackSid !== publication.trackSid
        )
      );
    });

    try {
      // 여기만 수정: battleInfo에서 roomName과 participantName 사용
      const token = await getToken(roomName, participantName);

      await room.connect(LIVEKIT_URL, token);
      await room.localParticipant.enableCameraAndMicrophone();

      const videoTrack = room.localParticipant.videoTrackPublications
        .values()
        .next().value?.videoTrack;
      if (videoTrack) {
        setLocalTrack(videoTrack);
      }
    } catch (error) {
      console.log("There was an error connecting to the room:", error.message);
      await leaveRoom();
    }
  }

  async function leaveRoom() {
    // Leave the room by calling 'disconnect' method over the Room object
    await room?.disconnect();

    // Reset the state
    setRoom(undefined);
    setLocalTrack(undefined);
    setRemoteTracks([]);
    clearBattleInfo();
    navigate("/")
  }

  async function getToken(roomTitle, participantName) {
    const response = await fetch(APPLICATION_SERVER_URL + "token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomName: roomTitle,
        participantName: participantName,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Failed to get token: ${error.errorMessage}`);
    }

    const data = await response.json();
    console.log(data);
    return data.token;
  }

  return (
    <>
      <div id="room">
        <div id="room-header">
          <h2 id="room-title">{roomName}</h2>
          <button
            className="btn btn-danger"
            id="leave-room-button"
            onClick={leaveRoom}
          >
            Leave Room
          </button>
        </div>
        <div id="layout-container">
          {localTrack && (
            <VideoComponent
              track={localTrack}
              participantIdentity={participantName}
              local={true}
            />
          )}
          {remoteTracks.map((remoteTrack) =>
            remoteTrack.trackPublication.kind === "video" ? (
              <VideoComponent
                key={remoteTrack.trackPublication.trackSid}
                track={remoteTrack.trackPublication.videoTrack}
                participantIdentity={remoteTrack.participantIdentity}
              />
            ) : (
              <AudioComponent
                key={remoteTrack.trackPublication.trackSid}
                track={remoteTrack.trackPublication.audioTrack}
              />
            )
          )}
        </div>
      </div>
    </>
  );
}

export default BattleRoomPage;
