import Foundation
import AVFoundation
import CoreImage

/* Extrae el último fotograma de un video como PNG.
   uso: swift lastframe.swift <video.mp4> <salida.png> */

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("uso: lastframe <video.mp4> <salida.png>\n".data(using: .utf8)!)
    exit(1)
}
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let gen = AVAssetImageGenerator(asset: asset)
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
gen.appliesPreferredTrackTransform = true

let t = CMTimeSubtract(asset.duration, CMTime(value: 1, timescale: 30))
let cg = try gen.copyCGImage(at: t, actualTime: nil)
let ci = CIImage(cgImage: cg)
let ctx = CIContext()
try ctx.writePNGRepresentation(of: ci,
                               to: URL(fileURLWithPath: args[2]),
                               format: .RGBA8,
                               colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("ok \(args[2])")
