import Foundation
import AVFoundation
import CoreImage

/* Extrae un fotograma de un video como JPG en el tiempo dado.
   uso: swift frame.swift <video.mp4> <segundos|end> <salida.jpg> */

let args = CommandLine.arguments
guard args.count == 4 else {
    FileHandle.standardError.write("uso: frame <video.mp4> <segundos|end> <salida.jpg>\n".data(using: .utf8)!)
    exit(1)
}
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let gen = AVAssetImageGenerator(asset: asset)
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
gen.appliesPreferredTrackTransform = true

let dur = CMTimeGetSeconds(asset.duration)
let t: CMTime = args[2] == "end"
    ? CMTimeSubtract(asset.duration, CMTime(value: 1, timescale: 30))
    : CMTime(seconds: Double(args[2]) ?? 0, preferredTimescale: 600)
let cg = try gen.copyCGImage(at: t, actualTime: nil)
let ci = CIImage(cgImage: cg)
let ctx = CIContext()
try ctx.writeJPEGRepresentation(of: ci,
                                to: URL(fileURLWithPath: args[3]),
                                colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                                options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.7])
let track = asset.tracks(withMediaType: .video).first
let size = track?.naturalSize ?? .zero
print("ok \(args[3]) dur=\(String(format: "%.2f", dur))s size=\(Int(size.width))x\(Int(size.height))")
