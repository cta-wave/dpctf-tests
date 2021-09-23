# Test Configuration

To configure the tests, the `test-config.json` may be used to specify test parameters. The parameters are scoped on three different levels: Globally, template based or test specific.

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

| name                     | description                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `duration`               | The duration of the video in seconds.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `loading`                | Describes the order in which to load segments. Provides the CMAF Fragment number that is loaded at step i, constrained such that `(MAX(i-loading[i]) + MAX(loading[i]-i)) * MAX(df[k,i]) < max_buffer_duration`. For example: `[3, 2, 1, 6, 5, 4, 9, 8, 7]`                                                                                                                                                                             |
| `min_buffer_duration`    | Expresses the minimum buffer that the Source Buffer maintains in the playback in ms.                                                                                                                                                                                                                                                                                                                                                    |
| `playout`                | A mapping of segments from a specific representation and switching set to the segments being loaded into the video buffer. An array of triples defines switching set number, representation number and segment number for the respective segment in the video buffer. The first segment to load is defined by the first element, the second segment by the second element and so one. Example: `[[1, 2, 1], [1, 2, 2], [1, 2, 3], ...]` |
| `random_access_fragment` | Integer number of the fragment to skip to before start of buffering.                                                                                                                                                                                                                                                                                                                                                                    |
| `random_access_time`     | Time in seconds to skip to before start of buffering. Can be a floating point number.                                                                                                                                                                                                                                                                                                                                                   |
| `total_representations`  | The total count of representations in the test vector.                                                                                                                                                                                                                                                                                                                                                                                  |
| `ts_max`                 | The maximum permitted startup delay in ms.                                                                                                                                                                                                                                                                                                                                                                                              |
| `key_id`                 | Key ID of the encrypted content.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `content_key`            | Content key of the encrypted content.                                                                                                                                                                                                                                                                                                                                                                                                   |
