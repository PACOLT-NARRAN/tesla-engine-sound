One JSON file per engine (`<profileId>.json`) telling the importer which decoded AWC streams are the
on-load and off-load RPM sweeps and which RPM range they cover. The importer writes a first guess
with `"verified": false`; review it by listening to `audio-source/decoded/<id>/stream_*.wav`.
Format: see docs/AUDIO_PIPELINE.md.
