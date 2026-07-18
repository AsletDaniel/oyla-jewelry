import Foundation
import AVFoundation

/* Re-exporta un video a 1080p H.264 optimizado para web.
   uso: swift compress.swift <entrada.mp4> <salida.mp4> [preset]
   preset: 1080 (defecto) | 720 */

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("uso: compress <entrada.mp4> <salida.mp4> [1080|720]\n".data(using: .utf8)!)
    exit(1)
}
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])
let preset = (args.count > 3 && args[3] == "720") ? AVAssetExportPreset1280x720 : AVAssetExportPreset1920x1080
try? FileManager.default.removeItem(at: outURL)

let asset = AVURLAsset(url: inURL)
guard let export = AVAssetExportSession(asset: asset, presetName: preset) else {
    FileHandle.standardError.write("preset no disponible\n".data(using: .utf8)!)
    exit(1)
}
export.outputURL = outURL
export.outputFileType = .mp4
export.shouldOptimizeForNetworkUse = true

let sem = DispatchSemaphore(value: 0)
export.exportAsynchronously { sem.signal() }
sem.wait()

if export.status == .completed {
    let size = (try? FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as? Int) ?? 0
    print("ok \(outURL.lastPathComponent) \(size ?? 0) bytes")
} else {
    FileHandle.standardError.write("error: \(String(describing: export.error))\n".data(using: .utf8)!)
    exit(1)
}
