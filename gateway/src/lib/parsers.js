export function parseCpu(cpuString) {
  if (!cpuString) return 0;
  if (cpuString.endsWith('n')) return parseFloat(cpuString) / 1_000_000_000;
  if (cpuString.endsWith('u')) return parseFloat(cpuString) / 1_000_000;
  if (cpuString.endsWith('m')) return parseFloat(cpuString) / 1000;
  return parseFloat(cpuString);
}

export function parseMemory(memoryString) {
  if (!memoryString) return 0;

  const units = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
  };

  for (const [unit, multiplier] of Object.entries(units)) {
    if (memoryString.endsWith(unit)) {
      return parseFloat(memoryString) * multiplier;
    }
  }

  return parseFloat(memoryString);
}
