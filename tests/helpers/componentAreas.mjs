/** Areas of visible pixel islands, joining seams of up to two pixels. */
export function componentAreas(pixels, width, height, minArea = 16) {
  const visited = new Uint8Array(width * height);
  const areas = [];
  for (let i = 0; i < width * height; i++) {
    if (visited[i] || pixels[i * 4 + 3] < 48) continue;
    const queue = [i]; visited[i] = 1;
    for (let at = 0; at < queue.length; at++) {
      const current = queue[at], x = current % width, y = Math.floor(current / width);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const index = ny * width + nx;
        if (!visited[index] && pixels[index * 4 + 3] >= 48) {
          visited[index] = 1; queue.push(index);
        }
      }
    }
    if (queue.length >= minArea) areas.push(queue.length);
  }
  return areas.sort((a, b) => b - a);
}
