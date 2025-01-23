import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback 
} from 'react';

import { OpenVidu } from 'openvidu-browser';
import axios from 'axios';
import './App.css';
import UserVideoComponent from './UserVideoComponent';

const APPLICATION_SERVER_URL = process.env.NODE_ENV === 'production' ? '' : 'https://demos.openvidu.io/';

function App() {

  // useState를 사용하여 state 관리
  const [mySessionId, setMySessionId] = useState('SessionA');
  const [myUserName, setMyUserName] = useState(`Participant${Math.floor(Math.random() * 100)}`);
  const [session, setSession] = useState(undefined);
  const [mainStreamManager, setMainStreamManager] = useState(undefined); // Main video of the page
  const [publisher, setPublisher] = useState(undefined);
  const [subscribers, setSubscribers] = useState([]);
  const [currentVideoDevice, setCurrentVideoDevice] = useState(null);

  const OV = useRef(null); // useRef를 사용하여 변수에 대한 참조를 저장, 컴포넌트가 리렌더링되어도 변수에 대한 참조가 유지(값을 유지지)

  // useEffect 훅을 사용해서 컴포넌트 렌더링 시 특정 작업 실행하는 hook
  useEffect(() => {
    // handleBeforeUnload 함수 생성
    const handleBeforeUnload = () => leaveSession();
    // 언마운트(페이지 이동 시, beforeunload) 시 세션 연결 해제(handleBeforeUnload 함수 실행)
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      // 언마운트 시 handleBeforeUnload 함수 실행하고 나서, 이전에 추가했던 이벤트 제거(메모리 누수 방지)
        window.removeEventListener('beforeunload', handleBeforeUnload);
    };
    // 빈 배열을 넣어주면 컴포넌트가 마운트될 때만 실행되고 언마운트될 때만 실행
  }, []);

  // usecallback을 사용해서 함수 재생성 방지, 불필요한 리랜더링 감소소
  const joinSession = useCallback(async (event) => {
    if (event) {
        event.preventDefault();
    }

    OV.current = new OpenVidu();
    const mySession = OV.current.initSession();
    setSession(mySession);

    // 스트림 생성 이벤트 핸들러
    mySession.on('streamCreated', async (event) => {
        try {
            const subscriber = mySession.subscribe(event.stream, undefined);
            subscriber.on('streamPlaying', (e) => {
                console.log('Stream playing:', e);
            });
            
            setSubscribers((prevSubscribers) => [...prevSubscribers, subscriber]);
        } catch (error) {
            console.error('스트림 구독 오류:', error);
        }
    });

    // 스트림 제거 이벤트 핸들러
    mySession.on('streamDestroyed', (event) => {
        const stream = event.stream;
        if (stream) {
            deleteSubscriber(stream.streamManager);
        }
    });

    // 참가자 퇴장 이벤트 핸들러
    mySession.on('participantLeft', (event) => {
        console.log('참가자 퇴장:', event.connectionId);
        setSubscribers((prevSubscribers) => 
            prevSubscribers.filter(sub => 
                sub.stream.connection.connectionId !== event.connectionId
            )
        );
    });

    // 세션 연결 해제 이벤트 핸들러
    mySession.on('sessionDisconnected', (event) => {
        console.log('세션 연결 해제:', event.reason);
        if (event.reason !== 'disconnect') {
            leaveSession();
        }
    });

    // 예외 처리 핸들러
    mySession.on('exception', (exception) => {
      console.warn(exception);
    });

    try {
        const token = await getToken();
        await mySession.connect(token, { clientData: myUserName });

        const publisher = await OV.current.initPublisherAsync(undefined, {
            audioSource: undefined,
            videoSource: undefined,
            publishAudio: true,
            publishVideo: true,
            resolution: '640x480',
            frameRate: 30,
            insertMode: 'APPEND',
            mirror: false
        });

        publisher.on('streamPlaying', (e) => {
            console.log('Publisher stream playing:', e);
        });

        await mySession.publish(publisher);

        const devices = await OV.current.getDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        const currentVideoDeviceId = publisher.stream.getMediaStream().getVideoTracks()[0].getSettings().deviceId;
        const currentVideoDevice = videoDevices.find(device => device.deviceId === currentVideoDeviceId);

        setCurrentVideoDevice(currentVideoDevice);
        setMainStreamManager(publisher);
        setPublisher(publisher);
    } catch (error) {
        console.error('세션 연결 중 오류 발생:', error);
    }
}, [myUserName]); //Hook 의존성 배열 - myUserName이 변경될 때만 함수 재생성

  // subscriber 삭제 함수 수정
  const deleteSubscriber = useCallback((streamManager) => {
    if (!streamManager) return;
    
    setSubscribers((prevSubscribers) => {
        return prevSubscribers.filter(sub => 
            sub.stream.streamId !== (streamManager.stream?.streamId || streamManager)
        );
    });
  }, []);

  //세션 연결 해제
  const leaveSession = useCallback(async () => { 
    try {
        // 세션이 존재하고 연결된 상태인지 확인
        if (session && session.connection) {
            // 먼저 스트림 발행 중지
            if (publisher) {
                await session.unpublish(publisher);
                publisher.stream.disposeWebRtcPeer();
                publisher.stream.disposeMediaStream();
            }
            
            // subscribers 정리
            for (const subscriber of subscribers) {
                if (subscriber.stream) {
                    await session.unsubscribe(subscriber);
                    subscriber.stream.disposeWebRtcPeer();
                    subscriber.stream.disposeMediaStream();
                }
            }

            // 세션 연결 해제
            await session.disconnect();
        }

        // OpenVidu 객체 정리
        if (OV.current) {
            OV.current = null;
        }

        // 모든 상태 초기화
        setSession(undefined);
        setSubscribers([]);
        setMySessionId('SessionA');
        setMyUserName(`Participant${Math.floor(Math.random() * 100)}`);
        setMainStreamManager(undefined);
        setPublisher(undefined);
    } catch (error) {
        console.log('세션 종료 중 오류 발생:', error);
    }
}, [session, publisher, subscribers]);

  const switchCamera = useCallback(async () => {
    try {
        const devices = await OV.current.getDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (videoDevices && videoDevices.length > 1) {
            const newVideoDevice = videoDevices.filter(device => 
                device.deviceId !== currentVideoDevice?.deviceId
            );

            if (newVideoDevice.length > 0) {
                const newPublisher = OV.current.initPublisher(undefined, {
                    videoSource: newVideoDevice[0].deviceId,
                    publishAudio: true,
                    publishVideo: true,
                    mirror: true
                });

                await session?.unpublish(mainStreamManager);
                await session?.publish(newPublisher);
                
                setCurrentVideoDevice(newVideoDevice[0]);
                setMainStreamManager(newPublisher);
                setPublisher(newPublisher);
            }
        }
    } catch (e) {
        console.error(e);
    }
  }, [session, mainStreamManager, currentVideoDevice]);


  const createSession = async (sessionId) => {
    try {
        const response = await axios.post(
            `${APPLICATION_SERVER_URL}api/sessions`,
            { customSessionId: sessionId },
            {
                headers: { 'Content-Type': 'application/json' }
            }
        );
        return response.data;
    } catch (error) {
        console.error('세션 생성 오류:', error);
        throw error;
    }
};

  const createToken = async (sessionId) => {
      try {
          const response = await axios.post(
              `${APPLICATION_SERVER_URL}api/sessions/${sessionId}/connections`,
              {},
              {
                  headers: { 'Content-Type': 'application/json' }
              }
          );
          return response.data;
      } catch (error) {
          console.error('토큰 생성 오류:', error);
          throw error;
      }
  };

  const getToken = useCallback(async () => {
      try {
          const sessionId = await createSession(mySessionId);
          return await createToken(sessionId);
      } catch (error) {
          console.error('토큰 획득 오류:', error);
          throw error;
      }
  }, [mySessionId]);

  const handleChangeUserName = (e) => {
    setMyUserName(e.target.value);
  };

  const handleChangeSessionId = (e) => {
    setMySessionId(e.target.value);
  };

  const handleMainVideoStream = useCallback((stream) => {
    if (mainStreamManager !== stream) {
        setMainStreamManager(stream);
    }
  }, [mainStreamManager]);

  return (
    <div className="container">
        {session === undefined ? (
            <div id="join">
                <div id="img-div">
                    <img 
                        src="resources/images/openvidu_grey_bg_transp_cropped.png" 
                        alt="OpenVidu logo" 
                    />
                </div>
                <div id="join-dialog" className="jumbotron vertical-center">
                    <h1>Join a video session</h1>
                    <form className="form-group" onSubmit={joinSession}>
                        <p>
                            <label>Participant: </label>
                            <input
                                className="form-control"
                                type="text"
                                id="userName"
                                value={myUserName}
                                onChange={handleChangeUserName}
                                required
                            />
                        </p>
                        <p>
                            <label>Session: </label>
                            <input
                                className="form-control"
                                type="text"
                                id="sessionId"
                                value={mySessionId}
                                onChange={handleChangeSessionId}
                                required
                            />
                        </p>
                        <p className="text-center">
                            <input 
                                className="btn btn-lg btn-success" 
                                type="submit" 
                                value="JOIN" 
                            />
                        </p>
                    </form>
                </div>
            </div>
        ) : (
            <div id="session">
                <div id="session-header">
                    <h1 id="session-title">{mySessionId}</h1>
                    <input
                        className="btn btn-large btn-danger"
                        type="button"
                        id="buttonLeaveSession"
                        onClick={leaveSession}
                        value="Leave session"
                    />
                    <input
                        className="btn btn-large btn-success"
                        type="button"
                        id="buttonSwitchCamera"
                        onClick={switchCamera}
                        value="Switch Camera"
                    />
                </div>

                <div id="video-container" className="row">
                    {/* 내 비디오 */}
                    {publisher && (
                        <div className="stream-container col-md-6">
                            <div className="streamComponent">
                                <div className="participant-name">
                                    <span>나</span>
                                </div>
                                <UserVideoComponent streamManager={publisher} />
                            </div>
                        </div>
                    )}
                    
                    {/* 상대방 비디오 */}
                    {subscribers.length > 0 && subscribers[0] && (
                        <div className="stream-container col-md-6">
                            <div className="streamComponent">
                                <div className="participant-name">
                                    <span>
                                        {JSON.parse(subscribers[0].stream.connection.data).clientData}
                                    </span>
                                </div>
                                <UserVideoComponent streamManager={subscribers[0]} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
}

export default App
