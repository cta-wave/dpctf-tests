# Test Configuration

There are 2 configuration files for the tests: 1) [`test-config.json`](test-config.json) includes the tests paramters as defined in the DPC Test specification and 2) [generated/tests.json](generated/tests.json) which includes information extracted from the MPD of the audio/video streams used in the tests. The structure of both configutation files is described in this document.

## test-config.json

To configure the tests, the [`test-config.json`](test-config.json) may be used to specify test parameters. The parameters are scoped on three different levels: Globally, template based or test specific.

When specifying a parameter globally, it is used by all tests that don't have the parameter specified in either their template or specific test. Global parameters are defined in the `all` object in the `test-config.json`:

```json
{
  "all": {
    "parameter1": "value1",
    "parameter2": "value2"
  }
}
```

When specifying a parameter for a test template, it will override corresponding global parameter definitions. It will be ignored, if it is defined test specific. Template based parameters are defined in an object with the template file name as key:

```json
{
  "sequential-track-playback.html": {
    "parameter1": "value1",
    "parameter2": "value2"
  }
}
```

When specifying a parameter for a specific test, it will override corresponding global and template based parameter definitions. Test specific parameters are defined in an object with the specific tests file path relative to the server root as key:

```json
{
  "Folder2/sequential-playback-of-encrypted-and-non-encrypted-baseline-content__ToS_MultiRate_fragmented__ToS_HEAACv2_fragmented.html": {
    "parameter1": "value1",
    "parameter2": "value2"
  }
}
```

## Test Parameters

| name                       | description                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `duration`                 | The duration of the video in seconds.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `loading`                  | Describes the order in which to load segments. Provides the CMAF Fragment number that is loaded at step i, constrained such that `(MAX(i-loading[i]) + MAX(loading[i]-i)) * MAX(df[k,i]) < max_buffer_duration`. For example: `[3, 2, 1, 6, 5, 4, 9, 8, 7]`                                                                                                                                                                             |
| `min_buffer_duration`      | Expresses the minimum buffer that the Source Buffer maintains in the playback in ms.                                                                                                                                                                                                                                                                                                                                                    |
| `playout`                  | A mapping of segments from a specific representation and switching set to the segments being loaded into the video buffer. An array of triples defines switching set number, representation number and segment number for the respective segment in the video buffer. The first segment to load is defined by the first element, the second segment by the second element and so one. Example: `[[1, 2, 1], [1, 2, 2], [1, 2, 3], ...]` |
| `random_access_fragment`   | Integer number of the fragment to skip to before start of buffering.                                                                                                                                                                                                                                                                                                                                                                    |
| `random_access_time`       | Time in seconds to skip to before start of buffering. Can be a floating point number.                                                                                                                                                                                                                                                                                                                                                   |
| `total_representations`    | The total count of representations in the test vector.                                                                                                                                                                                                                                                                                                                                                                                  |
| `ts_max`                   | The maximum permitted startup delay in ms.                                                                                                                                                                                                                                                                                                                                                                                              |
| `key_id`                   | Key ID of the encrypted content.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `content_key`              | Content key of the encrypted content.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `mse_reset_tolerance`      | Expresses the tolerance that is acceptable for a single MSE reset. This value is defined in milliseconds.                                                                                                                                                                                                                                                                                                                               |
| `waiting_duration`         | Time to wait after a “stall” event dispatched by the browser. After the waiting_duration new data is appended to the buffer in order to transition out of the stalling state.                                                                                                                                                                                                                                                           |
| `max_backward_buffer`      | Expresses the maximum backward buffer in seconds                                                                                                                                                                                                                                                                                                                                                                                        |
| `max_forward_buffer`       | Expresses the maximum forward buffer in seconds. This value shall be equal or larger than min_buffer_duration.                                                                                                                                                                                                                                                                                                                          |
| `playback_duration`        | Expresses the target playback duration in seconds. If no playback_duration is given, all CMAF fragments in the CMAF track shall be presented. The playback_duration shall not exceed the total duration of all CMAF fragments in the CMAF track.                                                                                                                                                                                        |
| `gap_duration`             | Expresses the duration of the gap in milliseconds. Default should be set to the duration of a fragment. This value shall not be smaller than the duration of a single CMAF chunk and should be specified as a multiple of the chunk duration.                                                                                                                                                                                           |
| `playback_mode`            | Defines the mode of playback which is either “live” or “vod”. In vod mode the player immediately seeks over gaps while in live mode the waiting time before the seek is equal to the duration of the gap (to keep a consistent live edge).                                                                                                                                                                                              |
| `append_window_boundaries` | The start and end times of the append windows to be created from the CMAF fragments of the CMAF track. The values are depicted as fragment numbers. In order to avoid overlapping fragments at append window boundaries only integer values are allowed. For instance: [{start:1, end:2}, {start: 3, end: 4}, {start: 5, end 8}] will result in the following append window boundaries                                                  |
| `waiting_timeout`          | Expresses the maximum time to wait for the video element to transition into playing state after the buffer has been filled. This value shall be provided in milliseconds.                                                                                                                                                                                                                                                               |
| `random_access_to`         | Expresses the playback time to seek to. This value shall be smaller than the total CMAF track duration and shall be defined in milliseconds.                                                                                                                                                                                                                                                                                            |
| `random_access_from`       | Expresses the playback time at which the seek is to be done. This value shall be smaller than random_access_to and shall be defined in milliseconds.                                                                                                                                                                                                                                                                                    |
| `test_timeout`             | Overrides the default test timeout.                                                                                                                                                                                                                                                                                                                                                                                                     |

## generated/tests.json

The [generated/tests.json](generated/tests.json) is auto-generated via the [generate-tests.py](generate-tests.py) and should not be edited. It includes information about the test streams defined in [tests.csv](tests.csv). The example below shows an example of a single entry in the tests.json.

```json
{
    "tests": {
        "d9666abb4a59ca7c6ad8bb8c9b8c0377": {
            "path": "avc_15_30_60-2021-09-09-online/sequential-track-playback__t1.html",
            "video": [
                "https://dash.akamaized.net/WAVE/vectors/2021-09-09/avc_sets/15_30_60/t1/stream.mpd"
            ],
            "audio": [],
            "code": "sequential-track-playback.html",
            "switchingSets": {
                "video": [
                    {
                        "cmaf_track_duration": "PT0H1M0.000S",
                        "fragment_duration": "PT0H0M2.016S",
                        "representations": {
                            "2": {
                                "period": 1,
                                "duration": 60,
                                "type": "video",
                                "frame_rate": "30",
                                "fragment_duration": 2.0
                            }
                        }
                    }
                ],
                "audio": []
            }
        },
        ...
    }
}
```

This is a brief description of the main elements in the example above:

- `tests`: the root element of the configuration object. It includes all tests declared in tests.csv.

  - `d9666abb4a59ca7c6ad8bb8c9b8c0377`: The ID of the test. It is auto-generated by the test-generation script.

    - `path`: the path of the corresponding test file within the generated folder.
    - `video`: array of the MPD URLs of video switching sets declared in the tests.csv
    - `audio`: array of the MPD URLs of audio switching sets declared in the tests.csv
    - `switchingSets`: includes video and audio switching sets declared in the tests.csv

      - `video`/`audio`: array that includes details about the video/audio switching sets extracted form the corresponding MPDs. Each item in the array represents a video switching set with the following properties (all values are extracted from the MPD):
      - `cmaf_track_duration`: the CMAF Track duration extracted from the corresponding audio or video MPD
      - `fragment_duration`: the fragment duration extracted from the corresponding audio or video MPD
      - `representations`: the audio or video representations extracted from the corresponding audio or video MPD. Each representation includes the following properties:
        - `period`: the period index associated with the representation. The index of the first period is `1`.
        - `duration`: the duration of the representation in seconds.
        - `type` (Deprecated): it is always `video` for video representations and `audio` representations.
        - `frame_rate`: the frame rate.
        - `fragment_duration`: the fragment duration in seconds.
