.PHONY: help install test stats dry-run clean

help:
	@echo "install   install python deps"
	@echo "test      run the test suite"
	@echo "stats     pipeline counts"
	@echo "dry-run   render outreach without sending (needs PORTFOLIO_URL)"
	@echo "clean     remove render workdir and caches"

install:
	pip install -r requirements.txt

test:
	python -m unittest discover -s tests -v

stats:
	python -m engine stats

dry-run:
	@test -n "$(PORTFOLIO_URL)" || (echo "set PORTFOLIO_URL=https://..." && exit 1)
	python -m engine campaign --portfolio-url "$(PORTFOLIO_URL)"

clean:
	rm -rf work __pycache__ */__pycache__ */*/__pycache__
