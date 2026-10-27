.PHONY: run test experiments check package
run:
	python3 server.py

test:
	python3 -m unittest discover -s tests -v

experiments:
	python3 experiments.py

check: test
	python3 -m compileall -q protocol.py server.py experiments.py
	node --check web/app.js

package:
	python3 package_submission.py
