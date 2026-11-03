# Keeping web and phone in step
Put these next to `web/` and `mobile/` (unzipped folders), as a `tools/` folder, then from that parent folder:

    node tools/checkSharedFiles.mjs   # shared drawing, training maths, photo map and photo files are identical
    node tools/checkApiParity.mjs     # every /api path a client calls exists on the server
    # after changing web/client/src/data/exerciseImages.js:
    cd mobile/MyDailyOSMobile && node tools/syncExerciseImages.mjs
