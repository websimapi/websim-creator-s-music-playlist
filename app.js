const { useState, useEffect, useMemo, useRef } = React;
const { createRoot } = ReactDOM;

function App() {
  const [isCreator, setIsCreator] = useState(false);
  const [trackList, setTrackList] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const [creatorName, setCreatorName] = useState('');

  const room = useMemo(() => new WebsimSocket(), []);

  useEffect(() => {
    const checkIfCreator = async () => {
      const creator = await window.websim.getCreatedBy();
      const creatorUsername = creator.username;
      setCreatorName(creatorUsername);
      setIsCreator(room.party.client.username === creatorUsername);
    };
    
    checkIfCreator();
    
    // Subscribe to track list updates
    const unsubscribe = room.collection('track').subscribe((tracks) => {
      // Sort by created_at in reverse (newest first)
      const sortedTracks = [...tracks].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      setTrackList(sortedTracks);
    });
    
    return () => unsubscribe();
  }, [room]);

  // Handle audio playback
  useEffect(() => {
    if (audioRef.current) {
      if (currentTrack && isPlaying) {
        audioRef.current.src = currentTrack.audioUrl;
        audioRef.current.play().catch(err => console.error("Playback error:", err));
      } else {
        audioRef.current.pause();
      }
    }
  }, [currentTrack, isPlaying]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setFile(selectedFile);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!file || !title.trim()) {
      alert("Please add a title and select an audio file");
      return;
    }
    
    try {
      setIsUploading(true);
      
      // Upload audio file
      const audioUrl = await window.websim.upload(file);
      
      // Create track record in the database
      await room.collection('track').create({
        title,
        description,
        audioUrl,
        fileType: file.type,
        fileName: file.name
      });
      
      // Reset form
      setTitle('');
      setDescription('');
      setFile(null);
      document.getElementById('file-input').value = '';
      
      setIsUploading(false);
    } catch (error) {
      console.error("Error uploading track:", error);
      alert("Failed to upload track. Please try again.");
      setIsUploading(false);
    }
  };

  const handleDeleteTrack = async (trackId) => {
    try {
      // If this is the current playing track, stop playback
      if (currentTrack && currentTrack.id === trackId) {
        setCurrentTrack(null);
        setIsPlaying(false);
      }
      
      await room.collection('track').delete(trackId);
    } catch (error) {
      console.error("Error deleting track:", error);
      alert("Failed to delete track. Please try again.");
    }
  };

  const playTrack = (track) => {
    if (currentTrack && currentTrack.id === track.id) {
      // Toggle play/pause for current track
      setIsPlaying(!isPlaying);
    } else {
      // Play new track
      setCurrentTrack(track);
      setIsPlaying(true);
    }
  };

  // Handle audio end event
  const handleAudioEnded = () => {
    const currentIndex = trackList.findIndex(track => track.id === currentTrack.id);
    if (currentIndex < trackList.length - 1) {
      // Play next track
      setCurrentTrack(trackList[currentIndex + 1]);
      setIsPlaying(true);
    } else {
      // End of playlist
      setIsPlaying(false);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Music Playlist</h1>
        <p className="description">Listen to {creatorName}'s playlist collection</p>
      </header>
      
      <audio 
        ref={audioRef} 
        className="hidden" 
        onEnded={handleAudioEnded}
        controls
      />
      
      {currentTrack && (
        <div className="current-track-info">
          <h3>Now Playing: {currentTrack.title}</h3>
          <p>{currentTrack.description}</p>
          <div className="player-controls">
            <button className="btn" onClick={() => setIsPlaying(!isPlaying)}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
          <audio 
            ref={audioRef} 
            className="audio-player" 
            controls
            onEnded={handleAudioEnded}
          />
        </div>
      )}
      
      {isCreator && (
        <div className="upload-container">
          <h2>Add New Track</h2>
          <form onSubmit={handleUpload}>
            <div className="form-group">
              <label htmlFor="title">Title*</label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="file-input">Audio File*</label>
              <input
                type="file"
                id="file-input"
                accept="audio/*"
                onChange={handleFileChange}
                required
              />
            </div>
            <button 
              type="submit" 
              className="btn" 
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload Track'}
            </button>
          </form>
        </div>
      )}
      
      <div className="playlist">
        <h2>Tracks</h2>
        {trackList.length === 0 ? (
          <div className="empty-playlist">
            <p>No tracks available yet.</p>
            {isCreator && <p>Upload your first track above!</p>}
          </div>
        ) : (
          trackList.map(track => (
            <div 
              key={track.id} 
              className={`track ${currentTrack && currentTrack.id === track.id && isPlaying ? 'playing' : ''}`}
            >
              <div className="track-controls">
                <button 
                  className="play-btn" 
                  onClick={() => playTrack(track)}
                >
                  {currentTrack && currentTrack.id === track.id && isPlaying ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                      <rect x="6" y="4" width="4" height="16" fill="#fff"/>
                      <rect x="14" y="4" width="4" height="16" fill="#fff"/>
                    </svg>
                  ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
                      <path d="M8 5v14l11-7z" fill="#fff"/>
                    </svg>
                  )}
                </button>
              </div>
              <div className="track-info">
                <div className="track-title">{track.title}</div>
                <div className="track-description">{track.description}</div>
                <div className="track-uploader">Added by: {track.username}</div>
              </div>
              {isCreator && track.username === room.party.client.username && (
                <button 
                  className="btn delete" 
                  onClick={() => handleDeleteTrack(track.id)}
                >
                  Delete
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById('app'));
root.render(<App />);

