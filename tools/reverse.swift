import Foundation
import AVFoundation
import CoreVideo

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("uso: reverse <entrada.mp4> <salida.mp4>\n".data(using: .utf8)!)
    exit(1)
}
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: outURL)

let asset = AVURLAsset(url: inURL)
guard let track = asset.tracks(withMediaType: .video).first else {
    FileHandle.standardError.write("sin pista de video\n".data(using: .utf8)!)
    exit(1)
}
let size = track.naturalSize
let fps = track.nominalFrameRate > 0 ? track.nominalFrameRate : 30

// 1) lista de tiempos de presentación (pasada barata, sin decodificar)
var ptsList: [CMTime] = []
do {
    let reader = try AVAssetReader(asset: asset)
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
    reader.add(output)
    reader.startReading()
    while let sample = output.copyNextSampleBuffer() {
        let pts = CMSampleBufferGetOutputPresentationTimeStamp(sample)
        if CMTIME_IS_VALID(pts) && CMSampleBufferGetNumSamples(sample) > 0 {
            ptsList.append(pts)
        }
    }
    reader.cancelReading()
}
ptsList.sort { CMTimeCompare($0, $1) < 0 }
guard !ptsList.isEmpty else {
    FileHandle.standardError.write("no se encontraron frames\n".data(using: .utf8)!)
    exit(1)
}
print("frames: \(ptsList.count), fps: \(fps), tamaño: \(Int(size.width))x\(Int(size.height))")

// 2) escritor
let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: Int(size.width),
    AVVideoHeightKey: Int(size.height),
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 14_000_000]
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(
    assetWriterInput: input,
    sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let frameDur = CMTime(value: 1, timescale: CMTimeScale(round(fps)))
var outIndex: Int64 = 0

// 3) procesar en bloques desde el final hacia el principio
let chunkSize = 10
var chunkStarts = stride(from: 0, to: ptsList.count, by: chunkSize).map { $0 }
chunkStarts.reverse()

for start in chunkStarts {
    let end = min(start + chunkSize, ptsList.count)
    let tStart = ptsList[start]
    let tEnd = end < ptsList.count ? ptsList[end] : CMTimeAdd(ptsList[ptsList.count-1], frameDur)
    let range = CMTimeRange(start: tStart, end: tEnd)

    let reader = try AVAssetReader(asset: asset)
    reader.timeRange = range
    let output = AVAssetReaderTrackOutput(track: track,
        outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
    reader.add(output)
    reader.startReading()

    var frames: [(CMTime, CVPixelBuffer)] = []
    while let sample = output.copyNextSampleBuffer() {
        guard let pb = CMSampleBufferGetImageBuffer(sample) else { continue }
        let pts = CMSampleBufferGetOutputPresentationTimeStamp(sample)
        frames.append((pts, pb))
    }
    reader.cancelReading()
    frames.sort { CMTimeCompare($0.0, $1.0) < 0 }

    for (_, pb) in frames.reversed() {
        while !input.isReadyForMoreMediaData { usleep(2000) }
        let ptsOut = CMTimeMultiply(frameDur, multiplier: Int32(outIndex))
        if !adaptor.append(pb, withPresentationTime: ptsOut) {
            FileHandle.standardError.write("fallo al escribir frame \(outIndex): \(String(describing: writer.error))\n".data(using: .utf8)!)
            exit(1)
        }
        outIndex += 1
    }
}

input.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
if writer.status == .completed {
    print("ok \(outURL.path) (\(outIndex) frames)")
} else {
    FileHandle.standardError.write("error: \(String(describing: writer.error))\n".data(using: .utf8)!)
    exit(1)
}
