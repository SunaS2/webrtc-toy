import React, { useEffect, useRef } from 'react';
import OpenViduVideoComponent from './OvVideo';
import './UserVideo.css';

const UserVideoComponent = ({ streamManager }) => {
    const getNicknameTag = () => {
        // Gets the nickName of the user
        if (!streamManager) return '';
        return JSON.parse(streamManager.stream.connection.data).clientData;
    };

    if (!streamManager) return null;

    return (
        <div className="streamcomponent">
            <OpenViduVideoComponent streamManager={streamManager} />
            <div>
                <p>{getNicknameTag()}</p>
            </div>
        </div>
    );
};

export default UserVideoComponent;