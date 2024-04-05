#!python

import sys
import os
import shutil
import errno
from pathlib import Path
import hashlib
import json
import urllib.request
import urllib.error
import http.client
import re
from xml.dom.minidom import parseString
from python_lib.gweis.isoduration import parse_duration

TYPE_AUDIO = "audio"
TYPE_VIDEO = "video"

if len(sys.argv) < 3:
    print("Please provide a CSV and destination directory!")
    sys.exit(1)

TESTS_DIR = Path(sys.argv[0]).absolute().parent
LIB_DIR = Path(TESTS_DIR, "lib")
SUB_TEST_DIR = Path(TESTS_DIR, "subtests")
PLACEHOLDER_FILE = Path(TESTS_DIR, "placeholder.js")
CSV_FILE = sys.argv[1]
DEST_DIR = sys.argv[2]
MPD_ROOT_DIR = "."
if len(sys.argv) >= 4:
    MPD_ROOT_DIR = sys.argv[3]
LIB_DEST_DIR = Path(DEST_DIR, "lib")

MPD_PARAMETERS = {
    "cmaf_track_duration": r'<MPD .*mediaPresentationDuration="([^"]+)"',
    "fragment_duration": r'<MPD .*maxSegmentDuration="([^"]+)"',
}

mpd_files = {}


def main():
    csv_file = load_csv(CSV_FILE)

    mpd_video_parameters = {}
    mpd_audio_parameters = {}

    tests = []
    current_test_id = None

    for test in csv_file:
        video_mpd_url = test[1]
        audio_mpd_url = test[2]
        grouping_dir = test[3]
        test_template_path = get_test_path(test[0])
        template_file = str(test_template_path).split("/")[-1]
        video_file_name = str(video_mpd_url).split("/")[-1]
        video_file_name = ".".join(video_file_name.split(".")[0:-1])
        audio_file_name = str(audio_mpd_url).split("/")[-1]
        audio_file_name = ".".join(audio_file_name.split(".")[0:-1])
        test_id = generate_test_id(
            template_file + "video" + video_mpd_url + "audio" + audio_mpd_url + grouping_dir)

        duplicate_test = None
        if test[0] != "":
            for lookup_test in tests:
                if lookup_test["id"] != test_id:
                    continue
                duplicate_test = lookup_test
                break

        if duplicate_test is not None:
            if "copies" not in duplicate_test:
                duplicate_test["copies"] = 1
            duplicate_test["copies"] += 1
            current_test_id = test_id
            continue

        video_parameters = None
        if video_mpd_url:
            if video_mpd_url in mpd_video_parameters:
                video_parameters = mpd_video_parameters[video_mpd_url]
            else:
                mpd_content = load_mpd_content(video_mpd_url)
                try:
                    video_parameters = parse_mpd_parameters(
                        mpd_content, [TYPE_VIDEO])
                except:
                    print("ERROR: Failed to parse " + video_mpd_url)
                mpd_video_parameters[video_mpd_url] = video_parameters

        audio_parameters = None
        if audio_mpd_url:
            if audio_mpd_url in mpd_audio_parameters:
                audio_parameters = mpd_audio_parameters[audio_mpd_url]
            else:
                mpd_content = load_mpd_content(audio_mpd_url)
                audio_parameters = parse_mpd_parameters(
                    mpd_content, [TYPE_AUDIO])
                mpd_audio_parameters[audio_mpd_url] = audio_parameters

        if test[0] == "":
            for test in tests:
                if test["id"] != current_test_id:
                    continue
                if video_mpd_url != "":
                    test["video"].append(video_mpd_url)
                if audio_mpd_url != "":
                    test["audio"].append(audio_mpd_url)
                if video_parameters:
                    test["switching_sets"]["video"].append(video_parameters)
                if audio_parameters:
                    test["switching_sets"]["audio"].append(audio_parameters)
        else:
            video_urls = []
            if video_mpd_url != "":
                video_urls.append(video_mpd_url)
            audio_urls = []
            if audio_mpd_url != "":
                audio_urls.append(audio_mpd_url)
            video_switching_sets = []
            if video_parameters:
                video_switching_sets.append(video_parameters)
            audio_switching_sets = []
            if audio_parameters:
                audio_switching_sets.append(audio_parameters)

            tests.append({
                "id": test_id,
                "template": test_template_path,
                "video": video_urls,
                "audio": audio_urls,
                "switching_sets": {"video": video_switching_sets, "audio": audio_switching_sets},
                "template_file": template_file,
                "group": grouping_dir
            })

            current_test_id = test_id

    tests_with_copy = []
    for test in tests:
        if "copies" not in test:
            continue
        tests_with_copy.append(test)

    for test in tests_with_copy:
        for i in range(1, test["copies"] + 1):
            test_copy = test.copy()
            test_copy["copy_number"] = i
            tests.append(test_copy)
        tests.remove(test)

    for test in tests:
        test_template_path = test["template"]
        video_mpd_urls = test["video"]
        audio_mpd_urls = test["audio"]
        template_file = test["template_file"]
        grouping_dir = test["group"]
        template_file_name = ".".join(template_file.split(".")[0:-1])
        copy_number = None
        if "copy_number" in test:
            copy_number = test["copy_number"]
        test_path_relative = generate_test_path(
            grouping_dir, template_file_name, video_mpd_urls, audio_mpd_urls, copy_number)
        test["id"] = generate_test_id(test_path_relative)
        test_path = "{}/{}".format(DEST_DIR, test_path_relative)
        test["path"] = test_path
        content = load_file(test_template_path)
        content = generate_test(
            content, video_mpd_urls, audio_mpd_urls, test_path_relative, template_file)

        write_file(test_path, content)

    test_json_content = generate_test_json(tests)
    test_json_content = json.dumps(test_json_content, indent=4)
    write_file(Path(DEST_DIR, "tests.json"), test_json_content)
    copy(LIB_DIR, LIB_DEST_DIR)


def parse_mpd_parameters(content, types):
    parameters = {}
    if (content == ""):
        return parameters
    if type(content) != str:
        content = content.decode("utf-8")

    for parameter in MPD_PARAMETERS:
        match = re.search(MPD_PARAMETERS[parameter], content)
        if match is None:
            continue
        parameters[parameter] = match.group(1)

    representation_parameters = {}
    dom_tree = parseString(content)
    periods = dom_tree.getElementsByTagName("Period")
    periodNumber = 0
    for period in periods:
        periodNumber += 1
        periodDuration = period.getAttribute("duration")
        if periodDuration != "":
            periodDuration = parse_duration(periodDuration).seconds
        segmentTemplates = period.getElementsByTagName("SegmentTemplate")
        for segmentTemplate in segmentTemplates:
            if segmentTemplate.parentNode.tagName == "Representation":
                continue

            if segmentTemplate.hasAttribute("timescale"):
                timescale = segmentTemplate.getAttribute("timescale")
                parameters["timescale"] = int(timescale)

            segment_timeline_nodes = segmentTemplate.getElementsByTagName(
                "SegmentTimeline")
            if len(segment_timeline_nodes) != 0:
                segment_timelines = parse_segment_timelines(
                    segment_timeline_nodes[0])
                parameters["segmentTimeline"] = segment_timelines
            break

        source = dom_tree.getElementsByTagName("Source")
        if len(source) > 0:
            parameters["source"] = source[0].firstChild.nodeValue

        representations = period.getElementsByTagName("Representation")
        for representation in representations:
            representationId = representation.getAttribute("id")
            rep_parameters = {}
            rep_parameters["period"] = periodNumber

            if representation.hasAttribute("audioSamplingRate"):
                audioSamplingRate = representation.getAttribute(
                    "audioSamplingRate")
                rep_parameters["audioSamplingRate"] = int(audioSamplingRate)

            if periodDuration != "":
                rep_parameters["duration"] = periodDuration

            mime_type = representation.getAttribute("mimeType")
            content_type = re.search("^(.+)\/", mime_type).group(1)
            if content_type not in types:
                continue
            rep_parameters["type"] = content_type

            if representation.hasAttribute("frameRate"):
                frame_rate = representation.getAttribute("frameRate")
                rep_parameters["frame_rate"] = frame_rate

            segment_templates = representation.getElementsByTagName(
                "SegmentTemplate")
            if len(segment_templates) == 0 or len(segment_templates[0].getElementsByTagName("S")) == 0:
                adaptation_set = get_parent_by_name(
                    representation, "AdaptationSet")
                segment_templates = adaptation_set.getElementsByTagName(
                    "SegmentTemplate")

            seg_template_params = parse_segment_template(
                segment_templates[0])
            rep_parameters = merge_parameters(
                rep_parameters, seg_template_params)

            representation_parameters[representationId] = rep_parameters

        parameters["representations"] = representation_parameters

    return parameters


def parse_segment_timelines(segment_timeline_node):
    segment_timelines = []
    s_nodes = segment_timeline_node.getElementsByTagName("S")
    for s_node in s_nodes:
        segment_timeline = {}
        if s_node.hasAttribute("r"):
            r = s_node.getAttribute("r")
            segment_timeline["r"] = int(r)
        if s_node.hasAttribute("t"):
            t = s_node.getAttribute("t")
            segment_timeline["t"] = int(t)
        if s_node.hasAttribute("d"):
            d = s_node.getAttribute("d")
            segment_timeline["d"] = int(d)
        segment_timelines.append(segment_timeline)
    return segment_timelines


def parse_segment_template(node):
    parameters = {}
    fragment_duration = node.getAttribute("duration")
    if fragment_duration == "":
        fragment_duration = None
    if fragment_duration is not None:
        fragment_duration = int(fragment_duration)
    timescale = node.getAttribute("timescale")
    if timescale is not None:
        timescale = int(timescale)
        if fragment_duration is not None:
            fragment_duration = fragment_duration / timescale
    sum = 0
    segments = node.getElementsByTagName("S")
    for segment in segments:
        r = segment.getAttribute("r")
        if r == "":
            r = 0
        r = int(r)
        d = segment.getAttribute("d")
        d = int(d)
        sum = sum + (r + 1) * d

        if fragment_duration is None:
            fragment_duration = d / timescale

    duration = sum / timescale
    parameters["duration"] = duration
    parameters["fragment_duration"] = fragment_duration
    parameters["timescale"] = timescale

    segment_timeline_nodes = node.getElementsByTagName("SegmentTimeline")
    if len(segment_timeline_nodes) != 0:
        segment_timelines = parse_segment_timelines(segment_timeline_nodes[0])
        parameters["segmentTimeline"] = segment_timelines

    return parameters


def merge_parameters(setA, setB):
    parameter_names = [
        "duration",
        "fragment_duration",
        "timescale",
        "segmentTimeline",
    ]
    for parameter_name in parameter_names:
        if parameter_name in setA:
            continue
        if parameter_name not in setB:
            continue
        setA[parameter_name] = setB[parameter_name]
    return setA


def get_parent_by_name(node, name):
    parent = None

    while parent is None:
        node = node.parentNode
        if node.tagName == name:
            parent = node
    return parent


def load_mpd_content(mpd_path):
    if mpd_path in mpd_files:
        return mpd_files[mpd_path]

    content = ""
    if mpd_path.startswith("http"):
        print("Fetching MPD {}".format(mpd_path))
        count = 5
        while count > 0:
            try:
                content = urllib.request.urlopen(mpd_path).read()
                break
            except urllib.error.HTTPError:
                print("ERROR: Could not load http url:", mpd_path)
                break
            except http.client.IncompleteRead:
                print("ERROR: Incomplete read. Retrying ...")
                count -= 1
    else:
        # print("Fetching MPD {}".format(mpd_path))
        # mpd_path = mpd_path.replace("/content/", "https://dash.akamaized.net/WAVE/vectors/")
        # try:
        #     content = urllib.request.urlopen(mpd_path).read()
        # except urllib.error.HTTPError:
        #     print("Could not load http url:", mpd_path)
        file_path = os.path.join(MPD_ROOT_DIR, mpd_path[1:])
        file_path = Path(file_path).absolute()
        print("Reading MPD {}".format(file_path))
        if not os.path.isfile(file_path):
            print("ERROR: Could not find file:", file_path)
            return content
        with open(file_path, "r") as file:
            return file.read()

    mpd_files[mpd_path] = content
    return content


def generate_test_json(tests):
    json = {"tests": {}}

    for test in tests:
        test_id = test["id"]
        video = test["video"]
        audio = test["audio"]
        path = str(test["path"]).replace(DEST_DIR + "/", "")
        template = str(test["template"]).split("/")[-1]
        switching_sets = test["switching_sets"]
        json["tests"][test_id] = {}
        json["tests"][test_id]["path"] = path
        json["tests"][test_id]["video"] = video
        json["tests"][test_id]["audio"] = audio
        json["tests"][test_id]["code"] = template
        json["tests"][test_id]["switchingSets"] = switching_sets

    return json


def generate_test_id(test_path_relative):
    hashobj = hashlib.md5(test_path_relative.encode("utf-8"))
    hash = hashobj.hexdigest()
    return hash


def load_file(path):
    with open(path, "r") as file:
        return file.read()


def write_file(path, content):
    parent = Path(path).parent
    if not os.path.exists(parent):
        os.makedirs(parent)

    with open(path, "w+") as file:
        file.write(content)


def copy(src, dest):
    if Path(dest).exists():
        return
    try:
        shutil.copytree(src, dest)
    except OSError as error:
        if error.errno == errno.ENOTDIR:
            shutil.copy(src, dest)
        else:
            raise


def load_csv(path):
    content = load_file(path)
    csv = []
    for line in content.split("\n"):
        if line == "":
            continue
        line = line[1:-1]
        row = []
        for column in line.split("\",\""):
            row.append(column)
        csv.append(row)
    return csv


def get_test_path(test_id):
    return Path(TESTS_DIR, test_id + ".html")


def generate_test(template, video_mpd_url, audio_mpd_url, test_path, template_name):
    template = template.replace(
        "\"{{VIDEO_MPD_URL}}\"", json.dumps(video_mpd_url))
    template = template.replace(
        "\"{{AUDIO_MPD_URL}}\"", json.dumps(audio_mpd_url))
    template = template.replace("{{TEMPLATE_NAME}}", template_name)
    return template


def generate_test_path(grouping_dir, template_file_name, video_file_paths, audio_file_paths, copy_number):
    identifiers = []
    for video_file_path in video_file_paths:
        if video_file_path.startswith("http"):
            video_file_path = urllib.parse.urlparse(video_file_path).path
        dir_path, file_name = os.path.split(video_file_path)
        dir_split = list(filter(lambda element: element !=
                         "" and element != ".", dir_path.split("/")))
        video_identifier = ""
        if len(dir_split) >= 2:
            video_identifier = "_".join(dir_split[-2:-1])
        else:
            video_identifier = ".".join(file_name.split(".")[:-1])
        if video_identifier not in identifiers:
            identifiers.append(video_identifier)

    for audio_file_path in audio_file_paths:
        if audio_file_path.startswith("http"):
            audio_file_path = urllib.parse.urlparse(audio_file_path).path
        dir_path, file_name = os.path.split(audio_file_path)
        dir_split = list(filter(lambda element: element !=
                         "" and element != ".", dir_path.split("/")))
        audio_identifier = ""
        if len(dir_split) >= 1:
            audio_identifier = "_".join(dir_split[-2:-1])
        else:
            audio_identifier = ".".join(file_name.split(".")[:-1])
        if audio_identifier not in identifiers:
            identifiers.append(audio_identifier)

    test_path = "{}/{}__{}".format(grouping_dir,
                                   template_file_name, "_".join(identifiers), "_")
    count = 1
    suffix = ""
    while os.path.exists(test_path + suffix + ".html"):
        suffix = str(count)
        count += 1

    copy_string = ""
    if type(copy_number) is int:
        copy_string = "-" + str(copy_number)

    return test_path + suffix + copy_string + ".html"


main()
