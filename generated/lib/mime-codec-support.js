function checkMimeAndCodecSupport(manifest) {
  var representations = manifest.getRepresentations();
  var unsupportedMimeCodecs = "";
  var allMimeCodecsSupported = true;

  for (var r of representations) {
    var mimeCodec = r.getMimeCodec();
    var supported = MediaSource.isTypeSupported(mimeCodec);
    if (!supported) {
      allMimeCodecsSupported = false;
      unsupportedMimeCodecs += " | " + mimeCodec;
    }
  }

  if (!allMimeCodecsSupported) {
    throw new Error(
      "Unsupported MIME types or codecs: " + unsupportedMimeCodecs
    );
  }
}
