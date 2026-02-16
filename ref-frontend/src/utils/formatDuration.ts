/**
 * Format milliseconds to HH:MM:SS:MS format
 * @param milliseconds - Duration in milliseconds
 * @returns Formatted duration string in HH:MM:SS:MS format
 */
export const formatDurationHHMMSSMS = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const remaining = milliseconds % 1000
  
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const millisecondsPart = Math.floor(remaining / 10) // Convert to centiseconds (MS in 00-99 range)
  
  const pad = (n: number) => n.toString().padStart(2, '0')
  
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(millisecondsPart)}`
}

/**
 * Format milliseconds to a readable string (MM:SS or HH:MM:SS)
 * @param milliseconds - Duration in milliseconds
 * @returns Formatted duration string
 */
export const formatDurationReadable = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  
  const pad = (n: number) => n.toString().padStart(2, '0')
  
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`
  }
  return `${minutes}:${pad(seconds)}`
}
