#!/usr/bin/python

import sys
import os
import shutil, errno
from pathlib import Path
import hashlib
import json
import urllib.request
import re
import zipfile
import time


if len(sys.argv) < 3:
    print("Please provide a json file and destination directory!")
    sys.exit(1)

JSON_PATH = sys.argv[1]
DEST_DIR = sys.argv[2]


def main():
    json_file = load_json(JSON_PATH)

    for vector_name in json_file:
        vector = json_file[vector_name]
        if "zipPath" not in vector:
            print("JSON does not include zip path!")
            return

        blob = load_zip(vector["zipPath"])

        tmp_file_name = "{}.zip".format(str(time.time()))
        with open(tmp_file_name, "wb") as file:
            file.write(blob)

        with zipfile.ZipFile(tmp_file_name, "r") as zip:
            path = os.path.join(DEST_DIR, vector_name)
            zip.extractall(path=path)
        

        files = os.listdir(".")
        for file in files:
            if re.match(r"\d+\.\d+\.zip", file) is None:
                continue
            os.remove(file)



def load_json(json_path):
    content = ""
    if json_path.startswith("http"):
        print("Fetching JSON {}".format(json_path))
        try:
            content = urllib.request.urlopen(json_path).read()
        except urllib.error.HTTPError:
            print("Could not load http url:", json_path)
    else:
        file_path = Path(json_path).absolute()
        print("Reading JSON {}".format(file_path))
        if not os.path.isfile(file_path):
            print("Could not find file:", file_path)
            return content
        with open(file_path, "r") as file:
            content = file.read()
    
    if type(content) is not str:
        content = content.decode("utf-8")
    return json.loads(content)

def load_zip(path):
    content = None
    print("Fetching zip {}".format(path))
    try:
        content = urllib.request.urlopen(path).read()
    except urllib.error.HTTPError:
        print("Could not load http url:", path)
    return content


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

main()
