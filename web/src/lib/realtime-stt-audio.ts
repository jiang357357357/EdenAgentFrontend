export const TARGET_SAMPLE_RATE = 16_000

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function floatToPcm16(input: Float32Array) {
  const buffer = new ArrayBuffer(input.length * 2)
  const view = new DataView(buffer)
  for (let index = 0; index < input.length; index += 1) {
    const sample = clamp(input[index], -1, 1)
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  return buffer
}

export function downsampleToPcm16(input: Float32Array, inputSampleRate: number) {
  if (inputSampleRate === TARGET_SAMPLE_RATE) return floatToPcm16(input)

  const ratio = inputSampleRate / TARGET_SAMPLE_RATE
  const outputLength = Math.max(1, Math.floor(input.length / ratio))
  const output = new Float32Array(outputLength)
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = Math.floor(outputIndex * ratio)
    const end = Math.min(input.length, Math.floor((outputIndex + 1) * ratio))
    let sum = 0
    let count = 0
    for (let inputIndex = start; inputIndex < end; inputIndex += 1) {
      sum += input[inputIndex]
      count += 1
    }
    output[outputIndex] = count > 0 ? sum / count : input[start] ?? 0
  }
  return floatToPcm16(output)
}

export function estimateLevel(input: Float32Array) {
  if (input.length === 0) return 0
  let sum = 0
  for (let index = 0; index < input.length; index += 1) {
    sum += input[index] * input[index]
  }
  return clamp(Math.sqrt(sum / input.length) * 6, 0, 1)
}

