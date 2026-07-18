import Foundation
import Vision
import CoreImage

let args = CommandLine.arguments
guard args.count == 3 else {
    FileHandle.standardError.write("uso: cutout <entrada.png> <salida.png>\n".data(using: .utf8)!)
    exit(1)
}
let inURL = URL(fileURLWithPath: args[1])
let outURL = URL(fileURLWithPath: args[2])

guard let ciImage = CIImage(contentsOf: inURL) else {
    FileHandle.standardError.write("no se pudo leer \(args[1])\n".data(using: .utf8)!)
    exit(1)
}

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: ciImage)
try handler.perform([request])

guard let result = request.results?.first else {
    FileHandle.standardError.write("no se detectó sujeto en \(args[1])\n".data(using: .utf8)!)
    exit(2)
}

let maskBuffer = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
let maskCI = CIImage(cvPixelBuffer: maskBuffer)

let blend = CIFilter(name: "CIBlendWithMask")!
blend.setValue(ciImage, forKey: kCIInputImageKey)
blend.setValue(CIImage(color: .clear).cropped(to: ciImage.extent), forKey: kCIInputBackgroundImageKey)
blend.setValue(maskCI, forKey: kCIInputMaskImageKey)

let ctx = CIContext()
try ctx.writePNGRepresentation(of: blend.outputImage!,
                               to: outURL,
                               format: .RGBA8,
                               colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
print("ok \(args[2])")
