ALTER TABLE "RejectionLetterTemplate"
ADD COLUMN "layoutConfig" JSONB NOT NULL
DEFAULT '{"pageSize":"A4","marginTopMm":18.344,"marginRightMm":22.578,"marginBottomMm":19.756,"marginLeftMm":22.578,"bodyFontSizePt":10,"bodyLineGapPt":2,"paragraphSpacingPt":4,"headerAlignment":"CENTER","logoPosition":"LEFT","blockOrder":["LETTERHEAD","TITLE","LETTER_META","RECIPIENT","BODY","CLOSING","DATE","SIGNATURE"],"blockAlignments":{"TITLE":"CENTER","DATE":"RIGHT","LETTER_META":"LEFT","RECIPIENT":"LEFT","BODY":"JUSTIFY","CLOSING":"JUSTIFY","SIGNATURE":"RIGHT"}}'::jsonb;
