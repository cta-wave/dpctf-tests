# DPCTF Tests

This repository contains tests for the [DPCTF Test
Runner](https://github.com/cta-wave/dpctf-test-runner).

## Generate Tests

To generate tests use the `generate-tests.py` script as follows

```
$ ./generate-tests.py <CSV-file> <destination-dir> [<mpd-root-dir>]
```

**CSV-file**: CSV file to generate tests from.  
**destination-dir**: Directory to put generated tests into.  
**mpd-root-dir** (optional): The root directory of relative local mpd paths.

As an example, in this repository the [`sample.csv`](./sample.csv) was used to generate tests inside the [`generated`](./generated) directory.

### CSV File Structure

Every row represents a generated test.

```csv
"<template-id>","<video-test-vector-url>","<audio-test-vector>","<group>"
```

**template-id**: What template to use.  
**video-test-vector-url**: URL to the video test content.  
**audio-test-vector-url**: URL to the audio test content.  
**group**: Name to group the generated test by. A directory per group is created.

Example

```csv
"fullscreen-playback-of-switching-sets","http://host.net/video.mpd","http://host.net/audio.mpd","Folder1"
"out-of-order-loading","http://host.net/video.mpd","http://host.net/audio.mpd","Folder2"
"overlapping-fragments","http://host.net/video.mpd","http://host.net/audio.mpd","Folder1"
```

### Templates

| id                                                                  | file                                                                                                                                                   | specification |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| sequential-track-playback                                           | [sequential-track-playback.html](./sequential-track-playback.html)                                                                                     | 8.2           |
| random-access-to-fragment                                           | [random-access-to-fragment.html](./random-access-to-fragment.html)                                                                                     | 8.3           |
| random-access-to-time                                               | [random-access-to-time.html](./random-access-to-time.html)                                                                                             | 8.4           |
| switching-set-playback                                              | [switching-set-playback.html](./switching-set-playback.html)                                                                                           | 8.5           |
| regular-playback-of-chunked-content                                 | [regular-playback-of-chunked-content.html](./regular-playback-of-chunked-content.html)                                                                 | 8.6           |
| regular-playback-of-chunked-content-non-aligned-append              | [regular-playback-of-chunked-content-non-aligned-append.html](./regular-playback-of-chunked-content-non-aligned-append.html)                           | 8.7           |
| playback-over-wave-baseline-splice-constraints                      | [playback-over-wave-baseline-splice-constraints.html](./playback-over-wave-baseline-splice-constraints.html)                                           | 8.8           |
| out-of-order-loading                                                | [out-of-order-loading.html](./out-of-order-loading.html)                                                                                               | 8.9           |
| overlapping-fragments                                               | [overlapping-fragments.html](./overlapping-fragments.html)                                                                                             | 8.10          |
| fullscreen-playback-of-switching-sets                               | [fullscreen-playback-of-switching-sets.html](./fullscreen-playback-of-switching-sets.html)                                                             | 8.11          |
| playback-of-encrypted-content                                       | [playback-of-encrypted-content.html](./playback-of-encrypted-content.html)                                                                             | 8.12          |
| restricted-splicing-of-encrypted-content                            | [restricted-splicing-of-encrypted-content.html](./restricted-splicing-of-encrypted-content.html)                                                       | 8.13          |
| sequential-playback-of-encrypted-and-non-encrypted-baseline-content | [sequential-playback-of-encrypted-and-non-encrypted-baseline-content.html](./sequential-playback-of-encrypted-and-non-encrypted-baseline-content.html) | 8.14          |
| regular-playback-of-a-cmaf-presentation                             | [regular-playback-of-a-cmaf-presentation.html](./regular-playback-of-a-cmaf-presentation.html)                                                         | 9.2           |
| random-access-of-a-wave-presentation                                | [random-access-of-a-wave-presentation.html](./random-access-of-a-wave-presentation.html)                                                               | 9.3           |
| splicing-of-wave-program-with-baseline-constraints                  | [splicing-of-wave-program-with-baseline-constraints.html](./splicing-of-wave-program-with-baseline-constraints.html)                                   | 9.4           |

Specification numbers refer to section numbers in [the DPCTF specification](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5003-final.pdf).

## Downloading content

The `download-content-py` may be used to download content using a JSON file,
which holds information about various test vectors:

```
./download-content.py <json-path/url> <dest-dir>
```

- **json-path/url**: Local file path or http url to the JSON file
- **dest-dir**: The directory to download the content to.

The script parses the following data from the JSON file:

```json
{
  "<content-name>": {
    "zipPath": "<url to zip>"
  }
}
```

- **content-name** is used to create a subdirectory in the specified
  destination directory to put the content into.
- **zipPath** is used to download the zip file.

## Running Tests

To run the tests, you can run the test runner locally by following the
instructions in the [DPCTF Deployment
Repository](https://github.com/cta-wave/dpctf-deploy).

The test runner will group the tests according to the grouping used in the CSV file, which allows running them in subsets.

![](./session-config.jpg)
When configuring a session, individual test groups can be selected to be used in the session.

![](./session-results.jpg)
Test results will also be grouped accordingly.
