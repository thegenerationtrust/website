#!/usr/bin/env swift
//
// process-headshots.swift
// -----------------------------------------------------------------------------
// Optimises portrait/headshot images for the web and gives them a consistent
// studio-grey background, matching the treatment used for the trustee photos.
//
// For each input image it:
//   1. Reads the image (respecting EXIF orientation).
//   2. Uses the macOS Vision framework to segment the person from the background.
//   3. Composites the person onto a consistent cool-grey radial-gradient backdrop.
//   4. Auto-frames a square crop around the detected face (falls back to a
//      top-biased centre crop if no face is found).
//   5. Scales to `targetSize` and writes an optimised JPEG.
//
// Requirements: macOS with the Swift toolchain (comes with Xcode / Command Line
// Tools). No external packages or model downloads — uses built-in Vision +
// CoreImage.
//
// USAGE:
//   swift scripts/process-headshots.swift <path> [<path> ...]
//
//   <path> may be an image file OR a directory (all .jpg/.jpeg/.png inside are
//   processed, non-recursively).
//
//   By default, optimised images are written to an "_optimized" subfolder next
//   to each source image, so originals are never overwritten. Review them, then
//   move them into place, e.g.:
//       mv assets/img/trustees/_optimized/* assets/img/trustees/
//
//   To overwrite originals in place instead, pass --in-place (back up first!).
//
// EXAMPLES:
//   # Process every image in the trustees folder -> _optimized subfolder
//   swift scripts/process-headshots.swift assets/img/trustees
//
//   # Process a single new headshot
//   swift scripts/process-headshots.swift "assets/img/trustees/New Trustee.jpg"
//
//   # Overwrite originals in place
//   swift scripts/process-headshots.swift --in-place assets/img/trustees
// -----------------------------------------------------------------------------

import Foundation
import CoreImage
import Vision
import AppKit
import ImageIO
import UniformTypeIdentifiers

// ---- Config (tweak to taste) ----
let targetSize: CGFloat = 400          // output square size in px
let jpegQuality: Double = 0.74         // 0.0–1.0
// Consistent cool mid-grey studio backdrop (subtle radial: lighter centre, darker edge)
let bgCentre = CIColor(red: 0.75, green: 0.77, blue: 0.81)
let bgEdge   = CIColor(red: 0.55, green: 0.58, blue: 0.63)

let ctx = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
let fm = FileManager.default

// ---- Argument parsing ----
var rawArgs = Array(CommandLine.arguments.dropFirst())
let inPlace = rawArgs.contains("--in-place")
rawArgs.removeAll { $0 == "--in-place" }

if rawArgs.isEmpty {
    FileHandle.standardError.write(Data("""
    Usage: swift scripts/process-headshots.swift [--in-place] <path> [<path> ...]
      <path>  image file or directory (processes .jpg/.jpeg/.png inside)

    """.utf8))
    exit(1)
}

let imageExts: Set<String> = ["jpg", "jpeg", "png"]

func collectImages(_ path: String) -> [String] {
    var isDir: ObjCBool = false
    guard fm.fileExists(atPath: path, isDirectory: &isDir) else {
        FileHandle.standardError.write(Data("WARN: not found: \(path)\n".utf8))
        return []
    }
    if isDir.boolValue {
        let entries = (try? fm.contentsOfDirectory(atPath: path)) ?? []
        return entries
            .filter { imageExts.contains(($0 as NSString).pathExtension.lowercased()) }
            .map { path + "/" + $0 }
            .sorted()
    }
    return imageExts.contains((path as NSString).pathExtension.lowercased()) ? [path] : []
}

// ---- Image processing ----
func orientedCIImage(path: String) -> CIImage? {
    let url = URL(fileURLWithPath: path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let cg = CGImageSourceCreateImageAtIndex(src, 0, nil) else { return nil }
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
    let orientation = (props?[kCGImagePropertyOrientation] as? UInt32) ?? 1
    return CIImage(cgImage: cg).oriented(forExifOrientation: Int32(orientation))
}

func personMask(_ ci: CIImage) -> CIImage? {
    let req = VNGeneratePersonSegmentationRequest()
    req.qualityLevel = .accurate
    req.outputPixelFormat = kCVPixelFormatType_OneComponent8
    let handler = VNImageRequestHandler(ciImage: ci, options: [:])
    do { try handler.perform([req]) } catch { return nil }
    guard let result = req.results?.first else { return nil }
    var mask = CIImage(cvPixelBuffer: result.pixelBuffer)
    let sx = ci.extent.width / mask.extent.width
    let sy = ci.extent.height / mask.extent.height
    mask = mask.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
    // soften edges slightly for clean compositing
    mask = mask.clampedToExtent().applyingGaussianBlur(sigma: 1.2).cropped(to: ci.extent)
    return mask
}

func faceRect(_ ci: CIImage) -> CGRect? {
    let req = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(ciImage: ci, options: [:])
    do { try handler.perform([req]) } catch { return nil }
    guard let faces = req.results, !faces.isEmpty else { return nil }
    let face = faces.max(by: {
        $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height
    })!
    let bb = face.boundingBox
    let e = ci.extent
    return CGRect(x: bb.origin.x * e.width, y: bb.origin.y * e.height,
                  width: bb.width * e.width, height: bb.height * e.height)
}

func greyBackground(extent: CGRect) -> CIImage {
    let g = CIFilter(name: "CIRadialGradient")!
    g.setValue(CIVector(x: extent.midX, y: extent.midY + extent.height * 0.10), forKey: "inputCenter")
    g.setValue(0.0, forKey: "inputRadius0")
    g.setValue(max(extent.width, extent.height) * 0.80, forKey: "inputRadius1")
    g.setValue(bgCentre, forKey: "inputColor0")
    g.setValue(bgEdge, forKey: "inputColor1")
    return g.outputImage!.cropped(to: extent)
}

func squareCrop(_ ci: CIImage, face: CGRect?) -> CIImage {
    let e = ci.extent
    var side: CGFloat
    var cx: CGFloat
    var cy: CGFloat // CI coords: origin bottom-left, y up
    if let f = face {
        side = min(f.height * 2.9, min(e.width, e.height))
        cx = f.midX
        // sit the face slightly above the vertical centre for headshot framing
        cy = f.midY - side * 0.10
    } else {
        side = min(e.width, e.height)
        cx = e.midX
        cy = e.maxY - side / 2 - e.height * 0.02 // bias toward top
    }
    var ox = cx - side / 2
    var oy = cy - side / 2
    ox = max(e.minX, min(ox, e.maxX - side))
    oy = max(e.minY, min(oy, e.maxY - side))
    return ci.cropped(to: CGRect(x: ox, y: oy, width: side, height: side))
}

func writeJPEG(_ cg: CGImage, to path: String, quality: Double) -> Bool {
    let url = URL(fileURLWithPath: path)
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { return false }
    CGImageDestinationAddImage(dest, cg, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    return CGImageDestinationFinalize(dest)
}

func process(_ inPath: String) {
    let name = (inPath as NSString).lastPathComponent
    guard let ci = orientedCIImage(path: inPath) else {
        print("SKIP (load failed): \(name)"); return
    }
    let composed: CIImage
    if let mask = personMask(ci) {
        let bg = greyBackground(extent: ci.extent)
        let blend = CIFilter(name: "CIBlendWithMask")!
        blend.setValue(ci, forKey: kCIInputImageKey)
        blend.setValue(bg, forKey: kCIInputBackgroundImageKey)
        blend.setValue(mask, forKey: kCIInputMaskImageKey)
        composed = blend.outputImage!.cropped(to: ci.extent)
    } else {
        print("WARN (no person mask, keeping original bg): \(name)")
        composed = ci
    }

    let face = faceRect(ci)
    let cropped = squareCrop(composed, face: face)
    let scale = targetSize / cropped.extent.width
    let translated = cropped.transformed(by: CGAffineTransform(translationX: -cropped.extent.origin.x, y: -cropped.extent.origin.y))
    let scaled = translated.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let outRect = CGRect(x: 0, y: 0, width: targetSize, height: targetSize)
    guard let cg = ctx.createCGImage(scaled, from: outRect) else {
        print("SKIP (render failed): \(name)"); return
    }

    let dir = (inPath as NSString).deletingLastPathComponent
    let outDir = inPlace ? dir : dir + "/_optimized"
    if !inPlace { try? fm.createDirectory(atPath: outDir, withIntermediateDirectories: true) }
    // Always output JPEG; normalise .png inputs to .jpg on output.
    let base = (name as NSString).deletingPathExtension
    let outName = ((name as NSString).pathExtension.lowercased() == "png") ? base + ".jpg" : name
    let outPath = outDir + "/" + outName

    let ok = writeJPEG(cg, to: outPath, quality: jpegQuality)
    let faceStr = face == nil ? "no-face" : "face-detected"
    print("\(ok ? "OK" : "FAIL"): \(name) -> \(outPath)  [\(faceStr)]")
}

// ---- Run ----
var images: [String] = []
for arg in rawArgs { images.append(contentsOf: collectImages(arg)) }
if images.isEmpty {
    FileHandle.standardError.write(Data("No images found to process.\n".utf8))
    exit(1)
}
for img in images { process(img) }
print("Done. Processed \(images.count) image(s).\(inPlace ? "" : " Review the _optimized folder(s), then move files into place.")")
