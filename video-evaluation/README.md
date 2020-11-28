# Video Evaluation

## Test IDs

The generated tests have long path/filenames e.g. `Folder1/fullscreen-playback-of-switching-sets-manual_ToS_MultiRate_fragmented.html`. These can be used as test identifier but it is preferred to use shorter IDs that can be embedded in QR codes and make them easier to read. For example, MD5 hash can be used for this purpose. The length of the generated MD5 hash is 16 bytes. For example, the MD5 hash for test `Folder1/fullscreen-playback-of-switching-sets-manual_ToS_MultiRate_fragmented.html` is `6250468ad9120c147e8ef1ab69e6daee`. The test generator script will be extended to generate a `tests.json` file that containts the IDs of all generated files. This allows us to get the test path/filename from the test ID embedded in the QR Code. The following example shows the structure of the generated `tests.json` file:

```javascript
{
  "tests": {
    "6250468ad9120c147e8ef1ab69e6daee": {
      "test": "Folder1/fullscreen-playback-of-switching-sets-manual_ToS_MultiRate_fragmented.html"
      "template": "fullscreen-playback-of-switching-sets-manual.html",
      "video": "http://dash.akamaized.net/WAVE/ContentModel/SinglePeriod/Fragmented/ToS_MultiRate_fragmented.mpd",
      "audio": "https://dash.akamaized.net/WAVE/ContentModel/SinglePeriod/Fragmented/ToS_HEAACv2_fragmented.mpd"
    }, 
    "7f97519615bc9a568c4511af359d2f84",{
      "test": "Folder2/fullscreen-playback-of-switching-sets-manual_ToS_MultiRate_fragmented.html"
      "template": "fullscreen-playback-of-switching-sets-manual.html",
      "video": "http://dash.akamaized.net/WAVE/ContentModel/SinglePeriod/Fragmented/ToS_MultiRate_fragmented.mpd",
      "audio": "https://dash.akamaized.net/WAVE/ContentModel/SinglePeriod/Fragmented/ToS_HEAACv2_fragmented.mpd"
    },
    ...
  }
}
```

## Test Configuration

Tests may need some configuration that can be changed. The configuration parameters are key/value pairs that are specific for a test are generic configuration for all tests. One solution is embed all configurations in a single `config.json` file with the following structure:

```javascript
{
  "all": {
    "param1": "value1",
    "param2": "value2"
  },
  "fullscreen-playback-of-switching-sets-manual": {
    "param10": "value10",
    "param11": "value11"
  },
  "out-of-order-loading-manual": {
    "param20": "value20",
    "param21": "value21",
    "param22": "value22"
  },
  ....
}
```

Each configuration parameter should have a default value. It should also possible to pass the configuration file in the [dpctf-deploy](https://github.com/cta-wave/dpctf-deploy) project. This allows building docker images with different configurations without the need to checkout the tests project and change the configuration there.   

## QR-Codes

```diff
! TODO: The description below needs to be updated and consider QR codes with 
! `test_id` (MD5 Hash ID described above) instead of the `test_url`.
```

### Pre-test

Additional QR-Codes provide information for an evaluation of video recordings. 
A pre-test control page announces the test that is about to be executed. It 
will contain human readble text, as well as a QR-code with information about 
the upcoming test.

![control page](./pre-test.jpg)

The QR-Code contains the following data structure:

```json
{
  "session_token": "014278a2-1eb9-11eb-be1f-0021ccd76152",
  "test_url": "Folder1/fullscreen-playback-of-switching-sets-manual_ToS_MultiRate_fragmented.html"
}
```

- **session_token**: The token of the current session  
- **test_url**: The URL to the upcoming test

The duration of pre-test control page can be configured in the test runners 
`config.json` file.

### Test embedded

Another QR-Code will be embedded into the test page itself. It contains 
information about the last action the test harness performed, as well as the 
current state of the video element.

![test page](./test.jpg)

The QR-Code contains the following data structure:

```json
{
  "state": "playing",
  "action": "play"
}
```

- **state**: The current state of the video element. Can be any of the following:
  - `waiting`
  - `buffering`
  - `playing`
  - `paused`
  - `ended`
- **action**: The last action the test harness performed. Can be any of the following:
  - `initialize`
  - `play`
  - `pause`

## Test Results

The information provided by the pre-test control page may be used to integrate 
the test results of the observation framework into the test results generated 
by the test runner.

Using the _session token_, test results may be downloaded after the session has finished:

```
GET /api/results/<session_token>/json
```

Additional information can be found [here](https://github.com/cta-wave/dpctf-test-runner/blob/master/tools/wave/docs/rest-api/results-api/download.md#3-download-all-apis)

Using the _test url_, the test results created by the evaluation of the 
recorded video may be inserted into the downloaded json file accordingly. To 
integrate the results back into the session, it may be uploaded using the 
_session token_:

```
POST /api/results/<session_token>/json
```

Note: The API to upload test results into a session is not yet implemented.
