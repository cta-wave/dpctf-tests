#!/usr/bin/python

import sys
import os
import shutil, errno
from pathlib import Path
import hashlib
import json
import urllib.request
import re

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

def main():
    csv_file = load_csv(CSV_FILE)

    mpd_parameters = {}

    tests = []

    for test in csv_file:
        video_mpd_url = test[1]
        audio_mpd_url = test[2]
        grouping_dir = test[3]
        test_template_path = get_test_path(test[0])
        template_file = str(test_template_path).split("/")[-1]
        template_file_name = ".".join(template_file.split(".")[0:-1])
        video_file_name = str(video_mpd_url).split("/")[-1]
        video_file_name = ".".join(video_file_name.split(".")[0:-1])
        audio_file_name = str(audio_mpd_url).split("/")[-1]
        audio_file_name = ".".join(audio_file_name.split(".")[0:-1])
        test_id = generate_test_id(template_file_name, video_file_name, audio_file_name)
        test_path_relative = generate_test_path(grouping_dir, template_file_name, video_file_name, audio_file_name)
        test_path = "{}/{}".format(DEST_DIR, test_path_relative)
        content = load_file(test_template_path)
        content = generate_test(content, video_mpd_url, audio_mpd_url, test_path_relative, template_file)
        write_file(test_path, content)

        parameters = None
        if video_mpd_url in mpd_parameters:
            parameters = mpd_parameters[video_mpd_url]
        else:
            mpd_content = load_mpd_content(video_mpd_url)
            parameters = parse_mpd_parameters(mpd_content)
            mpd_parameters[video_mpd_url] = parameters

        tests.append({
            "id": test_id,
            "path": test_path,
            "template": test_template_path, 
            "video": video_mpd_url, 
            "audio": audio_mpd_url,
            "parameters": parameters
        })
    test_json_content = generate_test_json(tests)
    test_json_content = json.dumps(test_json_content, indent=4)
    write_file(Path(DEST_DIR, "tests.json"), test_json_content)
    copy(LIB_DIR, LIB_DEST_DIR)

def parse_mpd_parameters(content):
    parameters = {}
    if (content == ""): return parameters
    if type(content) != str:
        content = content.decode("utf-8")

    for parameter in MPD_PARAMETERS:
        match = re.search(MPD_PARAMETERS[parameter], content)
        if match is None: continue
        parameters[parameter] = match.group(1)

    return parameters


def load_mpd_content(mpd_path):
    content = ""
    if mpd_path.startswith("http"):
        print("Fetching MPD {}".format(mpd_path))
        try:
            content = urllib.request.urlopen(mpd_path).read()
        except urllib.error.HTTPError:
            print("Could not load http url:", mpd_path)
    else:
        file_path = os.path.join(MPD_ROOT_DIR, mpd_path[1:])
        file_path = Path(file_path).absolute()
        print("Reading MPD {}".format(file_path))
        if not os.path.isfile(file_path):
            print("Could not find file:", file_path)
            return content
        with open(file_path, "r") as file:
            return file.read()
    
    return content

def generate_test_json(tests):
    json = {"tests": {}}

    for test in tests:
        test_id = test["id"]
        video = test["video"]
        audio = test["audio"]
        path = str(test["path"]).replace(DEST_DIR + "/", "")
        template = str(test["template"]).split("/")[-1]
        parameters = test["parameters"]
        json["tests"][test_id] = {}
        json["tests"][test_id]["path"] = path
        json["tests"][test_id]["video"] = video
        json["tests"][test_id]["audio"] = audio
        json["tests"][test_id]["code"] = template
        json["tests"][test_id]["parameters"] = parameters

    return json

def generate_test_id(template_path, video, audio):
    value = str(template_path) + str(video) + str(audio)
    hashobj = hashlib.md5(value.encode("utf-8"))
    return hashobj.hexdigest()


def load_file(path):
    with open(path, "r") as file:
        return file.read()

def write_file(path, content):
    parent = Path(path).parent
    if not parent.exists():
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
        else: raise

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
    template = template.replace("{{VIDEO_MPD_URL}}", video_mpd_url)
    template = template.replace("{{AUDIO_MPD_URL}}", audio_mpd_url)
    template = template.replace("{{TEST_PATH}}", test_path)
    template = template.replace("{{TEMPLATE_NAME}}", template_name)
    return template

def generate_test_path(grouping_dir, template_file_name, video_file_name, audio_file_name):
    test_path = "{}/{}__{}__{}".format(grouping_dir, template_file_name, video_file_name, audio_file_name)
    count = 1
    suffix = ""
    while os.path.exists(test_path + suffix + ".html"):
       suffix = str(count)
       count += 1
    return test_path + suffix + ".html"

main()
