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

const APPLICATION_SERVER_URL = process.env.NODE_ENV === 'production' ? 'https://9bda-14-46-142-196.ngrok-free.app/' : 'https://demos.openvidu.io/';

function App() {

  // useState를 사용하여 state 관리
  const [mySessionId, setMySessionId] = useState('SessionA');
  const [myUserName, setMyUserName] = useState(`Participant${Math.floor(Math.random() * 100)}`);
  const [session, setSession] = useState(undefined);
  const [mainStreamManager, setMainStreamManager] = useState(undefined); // Main video of the page
  const [publisher, setPublisher] = useState(undefined);
  const [subscribers, setSubscribers] = useState([]);
  const [currentVideoDevice, setCurrentVideoDevice] = useState(null);
  const [participantMode, setParticipantMode] = useState(''); // 참가자 모드 상태 추가
  const [speakingUsers, setSpeakingUsers] = useState(new Set());

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
    
    const mode = event.target.value === 'JOIN to Talker' ? 'talker' : 'watcher';
    setParticipantMode(mode);

    OV.current = new OpenVidu();
    const mySession = OV.current.initSession();

    // 세션 이벤트 핸들러 설정
    mySession.on('streamCreated', (event) => {
        const subscriber = mySession.subscribe(event.stream, undefined);
        setSubscribers((subscribers) => [...subscribers, subscriber]);
    });

    mySession.on('streamDestroyed', (event) => {
        setSubscribers((subscribers) => 
            subscribers.filter((sub) => sub !== event.stream.streamManager)
        );
    });

    mySession.on('exception', (exception) => {
        console.warn('세션 예외 발생:', exception);
    });

    setSession(mySession);

    try {
        const token = await getToken();
        const userData = mode === 'talker' ? 
            `${myUserName}-Talker` : 
            `${myUserName}-Watcher`;
            
        await mySession.connect(token, { clientData: userData });

        const publisher = await OV.current.initPublisherAsync(undefined, {
            audioSource: mode === 'talker' ? undefined : false,
            videoSource: undefined,
            publishAudio: mode === 'talker',
            publishVideo: true,
            resolution: '640x480',
            frameRate: 30,
            insertMode: 'APPEND',
            mirror: false
        });

        // 발화 감지 설정
        if (mode === 'talker') {
            publisher.on('publisherStartSpeaking', (event) => {
                setSpeakingUsers(prev => new Set(prev).add(publisher.stream.connection.connectionId));
            });

            publisher.on('publisherStopSpeaking', (event) => {
                setSpeakingUsers(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(publisher.stream.connection.connectionId);
                    return newSet;
                });
            });
        }

        publisher.on('streamCreated', (event) => {
            console.log('Publisher stream created:', event);
        });

        publisher.on('streamPlaying', () => {
            console.log('Publisher stream playing');
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
}, [myUserName]);

  // 세션 나가기 함수 수정
  const leaveSession = useCallback(() => {
    if (session) {
        session.disconnect();
    }

    // 상태 초기화
    OV.current = null;
    setSession(undefined);
    setSubscribers([]);
    setMySessionId('SessionA');
    setMyUserName(`Participant${Math.floor(Math.random() * 100)}`);
    setMainStreamManager(undefined);
    setPublisher(undefined);
}, [session]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
        if (session) {
            session.disconnect();
        }
    };
  }, [session]);

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

  // 구독자 타입 확인 함수 수정
  const getSubscriberType = (subscriber) => {
    try {
        const data = JSON.parse(subscriber.stream.connection.data);
        // 정확한 문자열 비교를 위해 수정
        return data.clientData.toLowerCase().includes('talker') ? 'talker' : 'watcher';
    } catch (error) {
        console.error('구독자 정보 파싱 오류:', error);
        return 'watcher';
    }
  };

  // 구독자의 발화 감지 이벤트 처리
  useEffect(() => {
    if (session) {
        session.on('publisherStartSpeaking', (event) => {
            setSpeakingUsers(prev => new Set(prev).add(event.connection.connectionId));
        });

        session.on('publisherStopSpeaking', (event) => {
            setSpeakingUsers(prev => {
                const newSet = new Set(prev);
                newSet.delete(event.connection.connectionId);
                return newSet;
            });
        });
    }
  }, [session]);

  return (
    <div className="container">
        {session === undefined ? (
            <div id="join">
                <div id="join-dialog" className="jumbotron vertical-center">
                    <h1>Join a video session</h1>
                    <form className="form-group">
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
                                type="button"  // submit에서 button으로 변경
                                value="JOIN to Talker" 
                                onClick={joinSession}
                                style={{ marginRight: '10px' }}
                            />
                            <input 
                                className="btn btn-lg btn-success" 
                                type="button"  // submit에서 button으로 변경
                                value="JOIN to Watcher" 
                                onClick={joinSession}
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
                    {participantMode === 'talker' && (
                        <input
                            className="btn btn-large btn-success"
                            type="button"
                            id="buttonSwitchCamera"
                            onClick={switchCamera}
                            value="Switch Camera"
                        />
                    )}
                </div>

                <div id="video-container" className="col-12">
                    {/* Talker 섹션 */}
                    <div className="row mb-3">
                        {/* 내가 Talker인 경우 표시 */}
                        {publisher && participantMode === 'talker' && (
                            <div className="col-md-6">
                                <div className={`talker-video-container ${
                                    speakingUsers.has(publisher.stream.connection.connectionId) ? 'speaking' : ''
                                }`}>
                                    <div className="participant-name">
                                        <span>{myUserName} (발표자)</span>
                                        {speakingUsers.has(publisher.stream.connection.connectionId) && 
                                            <span className="speaking-indicator">🎤</span>
                                        }
                                    </div>
                                    <UserVideoComponent streamManager={publisher} />
                                </div>
                            </div>
                        )}
                        
                        {/* 다른 Talker들 표시 */}
                        {subscribers
                            .filter(subscriber => getSubscriberType(subscriber) === 'talker')
                            .map((subscriber, i) => {
                                const subscriberData = JSON.parse(subscriber.stream.connection.data);
                                const subscriberName = subscriberData.clientData.split('-')[0];
                                const isSubscriberSpeaking = speakingUsers.has(subscriber.stream.connection.connectionId);
                                
                                return (
                                    <div className="col-md-6" key={i}>
                                        <div className={`talker-video-container ${isSubscriberSpeaking ? 'speaking' : ''}`}>
                                            <div className="participant-name">
                                                <span>{subscriberName} (발표자)</span>
                                                {isSubscriberSpeaking && 
                                                    <span className="speaking-indicator">🎤</span>
                                                }
                                            </div>
                                            <UserVideoComponent streamManager={subscriber} />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>

                    {/* Watcher 섹션 */}
                    <div className="row">
                        {/* 내가 Watcher인 경우 표시 */}
                        {publisher && participantMode === 'watcher' && (
                            <div className="col-md-3">
                                <div className="watcher-video-container">
                                    <div className="participant-name">
                                        <span>{myUserName} (시청자)</span>
                                    </div>
                                    <UserVideoComponent streamManager={publisher} />
                                </div>
                            </div>
                        )}
                        
                        {/* 다른 Watcher들 표시 */}
                        {subscribers
                            .filter(subscriber => getSubscriberType(subscriber) === 'watcher')
                            .map((subscriber, i) => {
                                const subscriberData = JSON.parse(subscriber.stream.connection.data);
                                const subscriberName = subscriberData.clientData.split('-')[0];
                                return (
                                    <div className={`${participantMode === 'watcher' ? 'col-md-3' : 'col-md-6'}`} key={i}>
                                        <div className={`${participantMode === 'watcher' ? 'watcher-video-container' : 'talker-video-container'}`}>
                                            <div className="participant-name">
                                                <span>{subscriberName} (시청자)</span>
                                            </div>
                                            <UserVideoComponent streamManager={subscriber} />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}

export default App
