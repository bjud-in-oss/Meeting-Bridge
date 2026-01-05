import { joinRoom, selfId } from 'trystero/torrent';
import { INetworkService } from './interfaces';
import { TranslationEvent, EventType, ControlSignal } from '../types/schema';

// App ID namespace for Trystero
const APP_ID = 'lingua-flow-p2p-v1';

export class NetworkService implements INetworkService {
  private room: any | null = null;
  private sendAction: any | null = null;
  private peers: Set<string> = new Set();
  private heartbeatInterval: any = null;

  // Callbacks storage
  private messageCallback: ((event: TranslationEvent, senderId: string) => void) | null = null;
  private peerJoinCallback: ((peerId: string) => void) | null = null;
  private peerLeaveCallback: ((peerId: string) => void) | null = null;
  private hostChangedCallback: ((hostId: string) => void) | null = null;

  constructor() {
    this.peers.add(selfId); // Add self to peer list for sorting
  }

  public getMyId(): string {
    return selfId;
  }

  public async joinRoom(roomId: string): Promise<void> {
    // Ensure clean state before joining
    if (this.room) {
      console.log('[P2P] Already in a room, leaving first...');
      this.leaveRoom();
    }

    try {
      console.log(`[P2P] Joining room: ${roomId} with AppID: ${APP_ID}`);
      
      // Initialize Trystero with explicit STUN servers
      // This is crucial for peers to find each other through NAT/Firewalls
      this.room = joinRoom({ 
        appId: APP_ID,
        rtcConfig: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      }, roomId);

      // Initialize Data Channel
      const [send, get] = this.room.makeAction('event');
      this.sendAction = send;

      // Listener: Incoming Data
      get((data: any, senderId: string) => {
        if (this.messageCallback) {
          // Ensure data matches TranslationEvent structure
          this.messageCallback(data as TranslationEvent, senderId);
        }
      });

      // Listener: Peer Joined
      this.room.onPeerJoin((peerId: string) => {
        console.log(`[P2P] Peer joined: ${peerId}`);
        this.peers.add(peerId);
        
        if (this.peerJoinCallback) {
          this.peerJoinCallback(peerId);
        }
        
        // Re-evaluate Host
        this._handlePeerDiscovery();
      });

      // Listener: Peer Left
      this.room.onPeerLeave((peerId: string) => {
        console.log(`[P2P] Peer left: ${peerId}`);
        this.peers.delete(peerId);
        
        if (this.peerLeaveCallback) {
          this.peerLeaveCallback(peerId);
        }

        // Re-evaluate Host
        this._handlePeerDiscovery();
      });

      // Start Heartbeat
      this._startHeartbeat();

      console.log(`[P2P] Joined room ${roomId} as ${selfId}`);
      
      // Initial host check (only self is known at start)
      this._handlePeerDiscovery();

    } catch (error) {
      console.error('[P2P] Failed to join room:', error);
      this.leaveRoom(); // Cleanup on fail
      throw error;
    }
  }

  public leaveRoom(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.room) {
      try {
        this.room.leave();
      } catch (e) {
        console.warn('Error leaving room:', e);
      }
      this.room = null;
      this.sendAction = null;
    }
    
    // Reset peers list to just self
    this.peers.clear();
    this.peers.add(selfId);
    console.log('[P2P] Left room');
  }

  public broadcast(event: TranslationEvent): void {
    if (this.sendAction) {
      this.sendAction(event);
    }
  }

  public sendToPeer(peerId: string, event: TranslationEvent): void {
    if (this.sendAction) {
      this.sendAction(event, peerId);
    }
  }

  // --- Registration Methods ---

  public onMessage(callback: (event: TranslationEvent, senderId: string) => void): void {
    this.messageCallback = callback;
  }

  public onPeerJoin(callback: (peerId: string) => void): void {
    this.peerJoinCallback = callback;
  }

  public onPeerLeave(callback: (peerId: string) => void): void {
    this.peerLeaveCallback = callback;
  }

  public onHostChanged(callback: (hostId: string) => void): void {
    this.hostChangedCallback = callback;
  }

  // --- Internal Logic ---

  /**
   * Sends a lightweight heartbeat to keep the mesh active
   * and detect connection issues early.
   */
  private _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      // We don't necessarily need to broadcast this to the app layer,
      // but keeping traffic flowing helps Trystero/WebRTC maintain NAT bindings.
      // We send a control signal that is ignored by the UI but keeps the pipe warm.
      const heartbeatEvent: TranslationEvent = {
        id: crypto.randomUUID(),
        type: EventType.CONTROL_SIGNAL,
        senderId: selfId,
        timestamp: Date.now(),
        payload: { signal: 'HEARTBEAT' as ControlSignal } 
      };
      
      this.broadcast(heartbeatEvent);
    }, 5000); // 5 seconds
  }

  /**
   * Leader Election Algorithm:
   * Sorts all known peer IDs alphanumerically.
   * The lowest ID is the Host.
   */
  private _handlePeerDiscovery() {
    const allPeers = Array.from(this.peers);
    if (allPeers.length === 0) return;

    // Sort peers to deterministically decide host
    allPeers.sort();

    const newHostId = allPeers[0];
    
    // Notify if host has changed (or is initially determined)
    if (this.hostChangedCallback) {
      this.hostChangedCallback(newHostId);
    }
  }
}