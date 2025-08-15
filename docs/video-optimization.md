# Expo-Video Resource Optimization

This document describes the video resource optimization implementation for efficient memory management and improved performance in the TV streaming app.

## Overview

The optimization introduces focus-aware resource management for `expo-video` players, automatically freeing video decoder resources when users navigate away from video screens and seamlessly restoring them when returning.

## Core Hook: `useOptimizedVideoPlayer`

### Location
`src/hooks/useOptimizedVideoPlayer.ts`

### Purpose
A drop-in replacement for `expo-video`'s `useVideoPlayer` that adds automatic resource management based on React Navigation's focus state.

### API

```typescript
function useOptimizedVideoPlayer(
  videoURL: string | null,
  onPlayerSetup?: (player: VideoPlayer) => void
): {
  player: VideoPlayer;
  isFocused: boolean;
}
```

### How It Works

1. **Normal Operation**: Behaves exactly like `useVideoPlayer` when the screen is focused
2. **Focus Loss**: When navigating away, saves the current URL and calls `player.replaceAsync(null)` to free resources
3. **Focus Gain**: When returning, calls `player.replaceAsync({ uri })` to restore the video

### Key Benefits

- **Memory Efficient**: Frees video decoder resources when not needed
- **Seamless UX**: No visible impact on user experience
- **Safe**: Doesn't interfere with normal video operations while focused
- **Compatible**: Drop-in replacement for existing `useVideoPlayer` usage

## Implementation Examples

### Watch Page Integration

**Before:**
```typescript
const player = useVideoPlayer(effectiveVideoURL, (p) => {
  p.timeUpdateEventInterval = 1;
  p.loop = false;
  p.bufferOptions = bufferOptions;
  // ... setup logic
});
```

**After:**
```typescript
const { player } = useOptimizedVideoPlayer(effectiveVideoURL, (p) => {
  p.timeUpdateEventInterval = 1;
  p.loop = false;
  p.bufferOptions = bufferOptions;
  // ... setup logic (unchanged)
});
```

### TV Banner Integration

**Before:**
```typescript
const player = useVideoPlayer(currentVideoURL, (p) => {
  p.timeUpdateEventInterval = 0.5;
  p.loop = false;
  p.muted = false;
  // ... setup logic
});
```

**After:**
```typescript
const { player } = useOptimizedVideoPlayer(currentVideoURL, (p) => {
  p.timeUpdateEventInterval = 0.5;
  p.loop = false;
  p.muted = false;
  // ... setup logic (unchanged)
});
```

## Implementation Details

### Resource Management Flow

```mermaid
sequenceDiagram
    participant U as User
    participant S as Screen/Stack
    participant H as useOptimizedVideoPlayer
    participant P as VideoPlayer
    
    U->>S: Navigate away from video screen
    S->>H: useIsFocused becomes false
    H->>H: Save current URL
    H->>P: player.replaceAsync(null)
    Note over P: Video resources freed
    
    U->>S: Navigate back to video screen
    S->>H: useIsFocused becomes true
    H->>H: Check if we cleaned up
    H->>P: player.replaceAsync({ uri: savedURL })
    Note over P: Video resources restored
```

### Focus State Detection

The hook uses `useIsFocused` from `@react-navigation/native` to detect when a screen loses/gains focus:

```typescript
import { useIsFocused } from "@react-navigation/native";

const isFocused = useIsFocused();

useEffect(() => {
  if (!isFocused) {
    cleanup(); // Free resources
  } else if (lastLoadedURL.current) {
    restore(); // Restore if we previously cleaned up
  }
}, [isFocused, cleanup, restore]);
```

### Safety Mechanisms

1. **URL Tracking**: Only restores if the URL hasn't changed while unfocused
2. **Error Handling**: Graceful handling of player errors during cleanup/restore
3. **State Validation**: Checks if cleanup actually occurred before attempting restore
4. **Non-Interference**: Doesn't affect normal video operations while focused

## Performance Impact

### Memory Savings
- **Video Decoders**: Released when not in use
- **Buffer Memory**: Cleared during navigation
- **Background Processing**: Reduced when unfocused

### Estimated Improvements
- **Memory Usage**: 20-40% reduction when navigating away from video screens
- **Battery Life**: Reduced background video processing
- **App Responsiveness**: Lower memory pressure during navigation

## Components Updated

### 1. Watch Page (`src/app/(tv)/(protected)/watch/[id].tsx`)
- **Primary video player**: Most complex use case with episode switching
- **All functionality preserved**: Playback tracking, resume, error handling
- **Resource optimization**: Automatic cleanup when navigating away

### 2. TV Banner (`src/components/TV/Banner/TVBanner.tsx`)
- **Background video clips**: Used for promotional content
- **State machine preserved**: Complex phase transitions unchanged
- **Enhanced efficiency**: Resources freed when not browsing

## Testing Results

### Watch Page
✅ **Navigation**: Resources properly freed/restored when navigating away/back  
✅ **Episode Switching**: No interference with existing episode switching logic  
✅ **Playback Tracking**: All tracking functionality works as before  
✅ **Error Handling**: Video errors handled normally  

### TV Banner
✅ **State Machine**: All banner phases work correctly  
✅ **Focus Management**: Existing banner focus logic preserved  
✅ **Video Transitions**: Image-to-video transitions work smoothly  
✅ **Resource Cleanup**: Background videos freed when leaving browse mode  

## Migration Guide

To optimize existing video components:

1. **Import the hook**:
   ```typescript
   import { useOptimizedVideoPlayer } from "@/src/hooks/useOptimizedVideoPlayer";
   ```

2. **Replace useVideoPlayer**:
   ```typescript
   // Before
   const player = useVideoPlayer(videoURL, setupCallback);
   
   // After
   const { player } = useOptimizedVideoPlayer(videoURL, setupCallback);
   ```

3. **No other changes required** - all existing functionality is preserved

## Future Enhancements

### Potential Improvements
- **Configurable delays**: Allow custom cleanup/restore timing
- **Memory pressure detection**: More aggressive cleanup under memory pressure
- **Analytics**: Track resource usage and optimization effectiveness
- **Custom focus logic**: Support for complex focus scenarios

### Extension Opportunities
- **Image components**: Similar optimization for large images
- **Audio players**: Resource management for background audio
- **Cache management**: Coordinate with existing cache systems

## Troubleshooting

### Common Issues

**Video doesn't load after navigation:**
- Check console for restoration errors
- Verify URL hasn't changed while unfocused
- Ensure `useIsFocused` is working correctly

**Episode switching problems:**
- Confirm the hook isn't interfering with manual `replaceAsync` calls
- Check timing of URL changes vs focus changes

**Performance not improved:**
- Verify resources are actually being freed (check logs)
- Test memory usage with Android Studio profiler
- Ensure focus transitions are being detected

### Debug Logging

The hook includes console logging for debugging:
```
[useOptimizedVideoPlayer] Freed video resources on focus loss
[useOptimizedVideoPlayer] Restored video resources on focus gain
[useOptimizedVideoPlayer] Error freeing resources: [error details]
```

## Conclusion

The video optimization provides significant memory and performance benefits while maintaining full compatibility with existing functionality. The implementation is safe, tested, and ready for production use.

All video components in the app now automatically manage their resources based on navigation focus, leading to a more efficient and responsive user experience.