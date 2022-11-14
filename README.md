# DPCTF Tests

This repository contains tests for the [DPCTF Test
Runner](https://github.com/cta-wave/dpctf-test-runner).
To deploy the test runner with the tests in this repository, please follow the instructions in the [DPCTF Deploy](https://github.com/cta-wave/dpctf-test-runner) project.

## Generate Tests

To generate tests use the `generate-tests.py` script as follows

```
$ ./generate-tests.py <CSV-file> <destination-dir> [<mpd-root-dir>]
```

**CSV-file**: CSV file to generate tests from.  
**destination-dir**: Directory to put generated tests into.  
**mpd-root-dir** (optional): The root directory of relative local mpd paths.

### CSV File Structure

Every row represents a generated test.

```csv
"<template-id>","<video-test-vector-url>","<audio-test-vector>","<group>"
```

**template-id**: What template to use.  
**video-test-vector-url**: URL to the video test content.  
**audio-test-vector-url**: URL to the audio test content.  
**group**: Name to group the generated test by. A directory per group is created.

You can refer to the [tests.csv](./tests.csv) for examples.

### Templates

| id                                                                               | file                                                                                                                                                                             | specification |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| sequential-track-playback                                                        | [sequential-track-playback.html](./sequential-track-playback.html)                                                                                                               | 8.2           |
| random-access-to-fragment                                                        | [random-access-to-fragment.html](./random-access-to-fragment.html)                                                                                                               | 8.3           |
| random-access-to-time                                                            | [random-access-to-time.html](./random-access-to-time.html)                                                                                                                       | 8.4           |
| switching-set-playback                                                           | [switching-set-playback.html](./switching-set-playback.html)                                                                                                                     | 8.5           |
| regular-playback-of-chunked-content                                              | [regular-playback-of-chunked-content.html](./regular-playback-of-chunked-content.html)                                                                                           | 8.6           |
| regular-playback-of-chunked-content-non-aligned-append                           | [regular-playback-of-chunked-content-non-aligned-append.html](./regular-playback-of-chunked-content-non-aligned-append.html)                                                     | 8.7           |
| playback-over-wave-baseline-splice-constraints                                   | [playback-over-wave-baseline-splice-constraints.html](./playback-over-wave-baseline-splice-constraints.html)                                                                     | 8.8           |
| out-of-order-loading                                                             | [out-of-order-loading.html](./out-of-order-loading.html)                                                                                                                         | 8.9           |
| overlapping-fragments                                                            | [overlapping-fragments.html](./overlapping-fragments.html)                                                                                                                       | 8.10          |
| fullscreen-playback-of-switching-sets                                            | [fullscreen-playback-of-switching-sets.html](./fullscreen-playback-of-switching-sets.html)                                                                                       | 8.11          |
| playback-of-encrypted-content                                                    | [playback-of-encrypted-content.html](./playback-of-encrypted-content-https.html)                                                                                                 | 8.12          |
| restricted-splicing-of-encrypted-content                                         | [restricted-splicing-of-encrypted-content.html](./restricted-splicing-of-encrypted-content-https.html)                                                                           | 8.13          |
| sequential-playback-of-encrypted-and-non-encrypted-baseline-content              | [sequential-playback-of-encrypted-and-non-encrypted-baseline-content.html](./sequential-playback-of-encrypted-and-non-encrypted-baseline-content-https.html)                     | 8.14          |
| regular-playback-of-a-cmaf-presentation                                          | [regular-playback-of-a-cmaf-presentation.html](./regular-playback-of-a-cmaf-presentation.html)                                                                                   | 9.2           |
| random-access-of-a-wave-presentation                                             | [random-access-of-a-wave-presentation.html](./random-access-of-a-wave-presentation.html)                                                                                         | 9.3           |
| splicing-of-wave-program-with-baseline-constraints                               | [splicing-of-wave-program-with-baseline-constraints.html](./splicing-of-wave-program-with-baseline-constraints.html)                                                             | 9.4           |
| source-buffer-re-initialization-without-changetype                               | [source-buffer-re-initialization-without-changetype.html](./source-buffer-re-initialization-without-changetype.html)                                                             | 8.15          |
| source-buffer-re-initialization-with-changetype                                  | [source-buffer-re-initialization-with-changetype.html](./source-buffer-re-initialization-with-changetype.html)                                                                   | 8.16          |
| buffer-underrun-and-recovery                                                     | [buffer-underrun-and-recovery.html](./buffer-underrun-and-recovery.html)                                                                                                         | 8.17          |
| truncated-playback-and-restart                                                   | [truncated-playback-and-restart.html](./truncated-playback-and-restart.html)                                                                                                     | 8.18          |
| long-duration-playback                                                           | [long-duration-playback.html](./long-duration-playback.html)                                                                                                                     | 8.19          |
| low-latency-initialization                                                       | [low-latency-initialization.html](./low-latency-initialization.html)                                                                                                             | 8.20          |
| low-latency-playback-over-gaps                                                   | [low-latency-playback-over-gaps.html](./low-latency-playback-over-gaps.html)                                                                                                     | 8.21          |
| mse-appendwindow                                                                 | [mse-appendwindow.html](./mse-appendwindow.html)                                                                                                                                 | 8.22          |
| low-latency-short-buffer-playback                                                | [low-latency-short-buffer-playback.html](./low-latency-short-buffer-playback.html)                                                                                               | 8.23          |
| random-access-from-one-place-in-a-stream-to-a-different-place-in-the-same-stream | [random-access-from-one-place-in-a-stream-to-a-different-place-in-the-same-stream.html](./random-access-from-one-place-in-a-stream-to-a-different-place-in-the-same-stream.html) | 8.24          |

Specification numbers refer to section numbers in [the DPCTF specification](https://cdn.cta.tech/cta/media/media/resources/standards/pdfs/cta-5003-final.pdf).

### Test configuration

Various parameters are used to configure the tests by specifying them in the test-config.json. A list of available parameters can be found [here](./TEST_CONFIG.md).

## Run Tests

As mentioned in the beginning of this README, in order to run tests in an automated way, please follow the instructions in the [DPCTF Deploy](https://github.com/cta-wave/dpctf-test-runner) project.

If you need to run dedicated tests e.g. for debugging purposes without the need to deploy the entire test runner, you can use the tests hosted in the [gh-pages](https://github.com/cta-wave/dpctf-tests/tree/github-pages) branch. These tests are accessible via https://cta-wave.github.io/dpctf-tests/generated/path/to/test.html. `path/to/test.html` needs to be replaced with the path of the test you want to run within the [generated test folder](https://github.com/cta-wave/dpctf-tests/tree/github-pages/generated). Examples:

- The URL for [avc_15_30_60-2021-09-09-online/sequential-track-playback\_\_t1.html](https://github.com/cta-wave/dpctf-tests/blob/github-pages/generated/avc_15_30_60-2021-09-09-online/sequential-track-playback__t1.html) test is https://cta-wave.github.io/dpctf-tests/generated/avc_15_30_60-2021-09-09-online/sequential-track-playback__t1.html
- The URL for [ac4-2021-09-29-online/sequential-track-playback\_\_at1.html](https://github.com/cta-wave/dpctf-tests/blob/github-pages/generated/ac4-2021-09-29-online/sequential-track-playback__at1.html) test is https://cta-wave.github.io/dpctf-tests/generated/ac4-2021-09-29-online/sequential-track-playback__at1.html

## Creating new tests

To create new tests proceed as follows:

- Create the HTML5 test template file (includes HTML+JS) similar to [sequential-track-playback.html](https://github.com/cta-wave/dpctf-tests/blob/master/sequential-track-playback.html). The template file includes placeholders for parameters like URL to audio and/or video MPDs. These will be replaced with the actual URLs in the generate script later. Example is [sequential-track-playback.html#L54-L55](https://github.com/cta-wave/dpctf-tests/blob/master/sequential-track-playback.html#L54-L55).
- Create an entry (or multiple entries) in a 'new' CSV file with URLs to audio and/or video MPDs. If your MPD includes audio and video AdaptationSets, you can use the same URL for both. The URL field can be the path to MPD in the content folder of the docker container or can be URL pointing to the content available online. The online content can be used during development or debugging purposes but should not be used in production to avoid higher latency while downloading the content during.
- Run `generate-tests.py my-new-file.csv` script which generates the tests in the generated folder only for entries in the new CSV file.
- If you are developer of new tests, usually you need a simple way to debug a single dedicated new developed test without the need to setup of whole docker which includes the test-runner. The only thing you need to do as developer of new tests in this phase is to serve the generated files via http/https and debug the test in browser.
- Once the new tests are implemented and tested, you can add the entries to the CSV file [tests.csv](https://github.com/cta-wave/dpctf-tests/blob/master/tests.csv), generate the tests, push to git (in a feature branch) and test everything together using [dpctf-deploy](https://github.com/cta-wave/dpctf-deploy). Please make sure when you create the docker image to use the new feature branch of [dpctf-tests](https://github.com/cta-wave/dpctf-tests) and not the main branch.

## Known Bugs

### Video not scaled properly

It may occur that the browser fails to load the required css stylesheet. As a result the video is not scale across the entire viewport. If you encouter this bug, please raise an issue.
