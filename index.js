// --trigger-event google.storage.object.finalize
// --trigger-event google.storage.object.delete


// gcloud functions deploy newFile --runtime nodejs12 --trigger-resource photosub.appspot.com --trigger-event google.storage.object.finalize
// gsutil cp DSC_1622.jpg gs://photosub.appspot.com/2014/misool
// file.name = "2014/misool/DSC_1378.jpg" ==> filepath
// file.eventType = "google.storage.object.finalize"

// File API: https://googleapis.dev/nodejs/storage/latest/File.html
// Trigger Sample: https://firebase.google.com/docs/functions/gcp-storage-events

const {Storage} = require('@google-cloud/storage');
const path = require('path');
const axios = require("axios");
const exifr = require('exifr');

exports.newFile = (file, context) => {
    const contentType = file.contentType; // File content type
    // Exit if this is triggered on a file that is not an image.
    if (!contentType.startsWith('image/')) {
        return console.log(`${file.name} is not an image.`);
    }
    
    console.log(`  Bucket: ${file.bucket}`);
    console.log(`  File: ${file.name}`);

    const storage = new Storage();
    const bucket = storage.bucket(file.bucket);
    const fileObject = bucket.file(file.name);    
    fileObject.download().then(function(data) {
        const fileContent = data[0];
        return exifr.parse(fileContent, { xmp: true, tiff: false, ifd0: false, gps: false, exif: false });
    }).then((xmp) => {

        let imageTitle = null;
        let imageDescription = null;
		let imageTags = null;
		let imageCaption = null;
		let captionTags = null;

		if (xmp !== null && xmp !== undefined) {
			
			// Update the intial gallery image
			imageTitle = getObjectProperty(xmp.title, "value", "");
			imageDescription = getObjectProperty(xmp.description, "value", "");
			imageTags = getObjectProperty(xmp, "subject", null);

			const captionSingleTerms = [];
			const captionComposedTerms = [];
			analyzeDescription(imageTitle, captionSingleTerms, captionComposedTerms);
			analyzeDescription(imageDescription, captionSingleTerms, captionComposedTerms);
			if (captionSingleTerms.length > 0 && captionComposedTerms.length > 0) {
				// Create the caption string by keeping duplicates to keep term order untouched
				imageCaption = " " + captionComposedTerms.join(" ") + " ";
				// remove duplicates for tags array using a Set
				const singleAndComposedTerms = captionSingleTerms.concat(captionComposedTerms);
				const tagSet = new Set(singleAndComposedTerms);
				captionTags = Array.from(tagSet);
			}
		}

        const filePathProps = path.parse(file.name);

		const newImageItem = {
            name: filePathProps.base,
            path: filePathProps.dir,
			title: imageTitle,
			description: imageDescription,
			tags: imageTags,
			caption: imageCaption,
			captionTags: captionTags
		};

        // Send post request api-photosub/image
        // Invoke API.
        axios.post("https://api-photosub-dot-photosub.ew.r.appspot.com/image", newImageItem).then(response => {
            console.log(response);
        }).catch(error => {
            console.error("Failed to insert new image.", error);
        });

    }).catch(error => {
        console.error(`Failed to download and analyze new image ${file.name}`, error);
    });
};

function getObjectProperty(object, propertyName, defaultValue) {
	if (object !== null && object !== undefined) {
		const propertyValue = object[propertyName]
		if (propertyValue !== undefined) {
			return propertyValue
		}
	}
	return defaultValue
}

function analyzeDescription(inputString, captionSingleTerms, captionComposedTerms) {
	if (inputString === null || inputString === undefined || inputString.length === 0) {
		return;
	}

	// InputString = "Carangue vorace, Carangue à gros yeux (Caranx sexfasciatus), Carangue balo (Carangoides gymnostethus)"
	// => to extract "Carangue", "vorace", "Carangue", gros", "yeux", "Caranx", "sexfasciatus", "Carangue", "balo", "Carangoides", "gymnostethus"
	// => each term must contain at least 3 characters
	const singleTermsExtractionRegex = new RegExp('[ (,\']*([^ (),\']{3,})[ ),\']*', 'g');

	// => to extract "Carangue vorace", "Carangue à gros yeux", "Caranx sexfasciatus", "Carangue balo", "Carangoides gymnostethus"
	const compositeTermsExtractionRegex = new RegExp('([^,()]+)', 'g');

	extractGroups(inputString, captionSingleTerms, singleTermsExtractionRegex);
	extractGroups(inputString, captionComposedTerms, compositeTermsExtractionRegex);
}

function extractGroups(inputString, tags, regex) {
	let match = null;
	while ((match = regex.exec(inputString)) !== null) {
		tags.push(match[1].trim().toLowerCase());
	}
}
