all: clean generate copy-files

generate:
	./generate-tests.py tests.csv generated
	
copy-files:
	mkdir -p generated
	cp test-config.json test-subsets.json generated
	
install:
	pip install -r requirements.txt

clean:
	rm -rf generated