A DPCTF test can have one or multiple tags representing its validation status or type. The current supported tags are:

* `validated`: Tests that have been thoroughly tested on various devices (mainly TVs) from different vendors and reviewed by the DPC task force. 
* `beta`: Tests that have been tested on at least one TV device. Tests without a validated or beta tag are only occasionally tested in desktop browsers and should be used at your own risk. 
* `long duration`: Most test content lasts between 30 seconds and 1 minute. A few tests require long-duration content (about 2 hours). This tag helps users easily include or exclude long-duration tests in the interface.

A current list of tests with assigned tags is available in [test-subsets.json](test-subsets.json), used in the test runner's web client as in the screenshot below.

![test-tags-ui](../../assets/1138409/f7e814dd-59fd-4381-a365-7bd4075172cc)
