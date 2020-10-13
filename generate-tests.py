#!/usr/bin/python

import sys
import os
import shutil, errno
from pathlib import Path

if len(sys.argv) < 3:
    print("Please provide a CSV and destination directory!")
    sys.exit(1)

TESTS_DIR = Path(sys.argv[0]).absolute().parent
LIB_DIR = Path(TESTS_DIR, "lib")
SUB_TEST_DIR = Path(TESTS_DIR, "subtests")
PLACEHOLDER_FILE = Path(TESTS_DIR, "placeholder.js")
CSV_FILE = sys.argv[1]
DEST_DIR = sys.argv[2]
LIB_DEST_DIR = Path(DEST_DIR, "lib")
SUB_TEST_DEST_DIR = Path(DEST_DIR, "subtests")
PLACEHOLDER_DEST_FILE = Path(DEST_DIR, "placeholder.js")

def main():
    csv_file = load_csv(CSV_FILE)

    for test in csv_file:
        test_id = test[0]
        mpd_url = test[1]
        grouping_dir = test[2]
        test_template_path = get_test_path(test_id)
        content = load_file(test_template_path)
        content = generate_test(content, mpd_url)
        test_path = generate_test_path(DEST_DIR, grouping_dir, test_id, mpd_url)
        write_file(test_path, content)
    copy(LIB_DIR, LIB_DEST_DIR)
    copy(SUB_TEST_DIR, SUB_TEST_DEST_DIR)
    copy(PLACEHOLDER_FILE, PLACEHOLDER_DEST_FILE)


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

def generate_test(template, mpd_url):
    template = template.replace("{{MPD_URL}}", mpd_url)
    return template

def generate_test_path(dir_path, grouping_dir, test_id, mpd_url):
    mpd_file_name = mpd_url.split("/")[-1]
    mpd_file_name = mpd_file_name.split(".")[0]
    return "{}/{}/{}_{}.html".format(dir_path, grouping_dir, test_id, mpd_file_name)

main()
