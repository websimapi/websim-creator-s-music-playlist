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
  // New state for admin panel
  const [activeAdminTab, setActiveAdminTab] = useState('upload');
  const [trackStats, setTrackStats] = useState({ total: 0, yours: 0 });
  const [editingTrack, setEditingTrack] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const room = useMemo(() => new WebsimSocket(), []);

  useEffect(() => {
    const checkIfCreator = async () => {
      const creator = await window.websim.getCreatedBy();
      const creatorUsername = creator.username;
      setCreatorName(creatorUsername);
      
      // Fix: Normalize usernames for comparison to handle @ symbols or case differences
      const normalizedCreator = creatorUsername.replace('@', '').toLowerCase();
      const normalizedClient = room.party.client.username.replace('@', '').toLowerCase();
      const isCreator = normalizedClient === normalizedCreator;
      
      setIsCreator(isCreator);
      setShowAdminPanel(isCreator);
    };
    
    checkIfCreator();
    
    // Subscribe to track list updates
    const unsubscribe = room.collection('track').subscribe((tracks) => {
      // Sort by created_at in reverse (newest first)
      const sortedTracks = [...tracks].sort((a, b) => 
        new Date(b.created_at) - new Date(a.created_at)
      );
      setTrackList(sortedTracks);
      
      // Update track stats
      const yourTracks = sortedTracks.filter(track => 
        track.username === room.party.client.username
      ).length;
      
      setTrackStats({
        total: sortedTracks.length,
        yours: yourTracks
      });
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

  const handleEditTrack = (track) => {
    setEditingTrack(track);
    setEditTitle(track.title);
    setEditDescription(track.description || '');
    setActiveAdminTab('edit');
  };

  const saveTrackEdit = async () => {
    if (!editingTrack) return;
    
    try {
      await room.collection('track').update(editingTrack.id, {
        title: editTitle,
        description: editDescription
      });
      
      setEditingTrack(null);
      setActiveAdminTab('manage');
    } catch (error) {
      console.error("Error updating track:", error);
      alert("Failed to update track. Please try again.");
    }
  };

  const clearAllTracks = async () => {
    if (!confirm("Are you sure you want to delete ALL tracks? This cannot be undone.")) return;
    
    try {
      const yourTracks = trackList.filter(track => 
        track.username === room.party.client.username
      );
      
      // Delete tracks one by one
      for (const track of yourTracks) {
        await room.collection('track').delete(track.id);
      }
    } catch (error) {
      console.error("Error clearing tracks:", error);
      alert("Failed to clear all tracks. Please try again.");
    }
  };

  // Component for admin panel
  const AdminPanel = () => {
    if (!isCreator || !showAdminPanel) return null;
    
    return (
      <div className="admin-panel">
        <h2>Admin Panel</h2>
        <div className="admin-tabs">
          <button 
            className={`admin-tab ${activeAdminTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveAdminTab('upload')}
          >
            Upload Track
          </button>
          <button 
            className={`admin-tab ${activeAdminTab === 'manage' ? 'active' : ''}`}
            onClick={() => setActiveAdminTab('manage')}
          >
            Manage Tracks
          </button>
          <button 
            className={`admin-tab ${activeAdminTab === 'edit' ? 'active' : ''}`}
            onClick={() => activeAdminTab !== 'edit' && setActiveAdminTab('stats')}
            disabled={activeAdminTab === 'edit'}
          >
            Statistics
          </button>
        </div>
        
        <div className="admin-content">
          {activeAdminTab === 'upload' && (
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
          )}
          
          {activeAdminTab === 'manage' && (
            <>
              <div className="track-stats">
                <div className="stat-card">
                  <div className="stat-value">{trackStats.total}</div>
                  <div className="stat-label">Total Tracks</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{trackStats.yours}</div>
                  <div className="stat-label">Your Tracks</div>
                </div>
              </div>
              
              <button className="btn delete" onClick={clearAllTracks}>
                Clear All My Tracks
              </button>
              
              <h3 style={{marginTop: '20px'}}>Your Tracks</h3>
              {trackList.filter(track => track.username === room.party.client.username).length === 0 ? (
                <p>You haven't uploaded any tracks yet.</p>
              ) : (
                trackList
                  .filter(track => track.username === room.party.client.username)
                  .map(track => (
                    <div key={track.id} className="track-entry">
                      <div className="track-entry-info">
                        <strong>{track.title}</strong>
                        {track.description && <span> - {track.description}</span>}
                      </div>
                      <div className="action-buttons">
                        <button className="inline-btn" onClick={() => handleEditTrack(track)}>
                          Edit
                        </button>
                        <button className="btn delete" onClick={() => handleDeleteTrack(track.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </>
          )}
          
          {activeAdminTab === 'edit' && editingTrack && (
            <div>
              <h3>Edit Track</h3>
              <div className="form-group">
                <label htmlFor="edit-title">Title*</label>
                <input
                  type="text"
                  id="edit-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-description">Description</label>
                <textarea
                  id="edit-description"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                />
              </div>
              <div className="action-buttons">
                <button className="btn" onClick={saveTrackEdit}>
                  Save Changes
                </button>
                <button 
                  className="btn delete" 
                  onClick={() => {
                    setEditingTrack(null);
                    setActiveAdminTab('manage');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          
          {activeAdminTab === 'stats' && (
            <div>
              <h3>Playlist Statistics</h3>
              <div className="track-stats">
                <div className="stat-card">
                  <div className="stat-value">{trackList.length}</div>
                  <div className="stat-label">Total Tracks</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {trackList.filter(t => t.username === room.party.client.username).length}
                  </div>
                  <div className="stat-label">Your Tracks</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {new Set(trackList.map(t => t.username)).size}
                  </div>
                  <div className="stat-label">Contributors</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <header>
        <h1>Music Playlist</h1>
        <p className="description">Listen to {creatorName}'s playlist collection</p>
        {isCreator && (
          <button 
            className="btn" 
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            style={{marginTop: '10px'}}
          >
            {showAdminPanel ? 'Hide Admin Panel' : 'Show Admin Panel'}
          </button>
        )}
      </header>
      
      <audio 
        ref={audioRef} 
        className="hidden" 
        onEnded={handleAudioEnded}
        controls
      />
      
      {/* Admin Panel */}
      <AdminPanel />
      
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
      
      {/* Remove the old upload form since it's now in the admin panel */}
      
      <div className="playlist">
        <h2>Tracks</h2>
        {trackList.length === 0 ? (
          <div className="empty-playlist">
            <p>No tracks available yet.</p>
            {isCreator && <p>Use the admin panel to upload your first track!</p>}
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
                <div className="action-buttons">
                  <button 
                    className="btn" 
                    onClick={() => handleEditTrack(track)}
                  >
                    Edit
                  </button>
                  <button 
                    className="btn delete" 
                    onClick={() => handleDeleteTrack(track.id)}
                  >
                    Delete
                  </button>
                </div>
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