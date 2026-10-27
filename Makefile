.PHONY: run test experiments check package
run:
	python3 server.py

test:
	python3 -m unittest discover -s tests -v

experiments:
	python3 experiments.py

check: test
	python3 -m compileall -q protocol.py server.py experiments.py transcript.py
	node --check web/app.js
	node --input-type=module --check < web/lab.js
	node --test tests/test_lab_model.mjs

package:
	python3 package_submission.py
