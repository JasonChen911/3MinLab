/** Verified real photography, downloaded locally. See public/images/activity-templates/SOURCES.md. */
export interface PresetPhoto { src: string; alt: string; source: string; author: string; license: string; licenseUrl: string }
export const PRESET_IMAGES: Record<string, PresetPhoto> = {
  "preset-welcome": {
    "src": "/images/activity-templates/welcome.webp",
    "alt": "校园中结伴交流的大学生",
    "source": "https://www.pexels.com/photo/students-walking-on-the-campus-7972653/",
    "author": "George Pak",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-lecture": {
    "src": "/images/activity-templates/academic-lecture.webp",
    "alt": "大学讲堂里讲师向听众演讲",
    "source": "https://www.pexels.com/photo/young-people-listening-to-a-lecturer-and-sound-equipment-in-background-20173236/",
    "author": "Israel Torres",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-startup": {
    "src": "/images/activity-templates/startup-pitch.webp",
    "alt": "创业者在白板前展示项目想法",
    "source": "https://www.pexels.com/photo/marketing-exit-technology-business-7413915/",
    "author": "RDNE Stock project",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-sports-match": {
    "src": "/images/activity-templates/athletics.webp",
    "alt": "运动员在真实田径跑道上竞赛",
    "source": "https://www.pexels.com/photo/athletes-competing-in-outdoor-track-race-30144519/",
    "author": "Ansey Photography",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-charity-service": {
    "src": "/images/activity-templates/volunteering.webp",
    "alt": "志愿者在公益活动中分发食品",
    "source": "https://www.pexels.com/photo/volunteer-event-with-food-distribution-34612590/",
    "author": "Caleb Oquendo",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-green": {
    "src": "/images/activity-templates/environment.webp",
    "alt": "志愿者合作栽种树苗",
    "source": "https://www.pexels.com/photo/people-planting-plant-together-5029923/",
    "author": "Anna Shvets",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-business-meeting": {
    "src": "/images/activity-templates/business-conference.webp",
    "alt": "商务会议中参会者与演讲人交流",
    "source": "https://www.pexels.com/photo/a-businesswoman-talking-to-a-speaker-at-a-business-conference-8761554/",
    "author": "Pavel Danilyuk",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-music-festival": {
    "src": "/images/activity-templates/music-festival.webp",
    "alt": "音乐节舞台表演、灯光与现场观众",
    "source": "https://www.pexels.com/photo/audience-in-front-of-a-stage-at-a-festival-14870726/",
    "author": "Sharing Festival / Jakob Braun",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-science": {
    "src": "/images/activity-templates/science.webp",
    "alt": "学生在实验室协作进行科学实验",
    "source": "https://www.pexels.com/photo/students-inside-a-science-laboratory-6208709/",
    "author": "cottonbro studio",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-community-festival": {
    "src": "/images/activity-templates/community-festival.webp",
    "alt": "户外社区节庆中的彩旗、人群与活动区域",
    "source": "https://www.pexels.com/photo/community-festival-with-maypole-and-crowd-31898210/",
    "author": "Helena Jankovičová Kováčová",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-annual": {
    "src": "/images/activity-templates/annual-awards.webp",
    "alt": "正式颁奖活动中主持人与获奖者同台",
    "source": "https://www.pexels.com/photo/award-ceremony-with-gift-presentation-35755227/",
    "author": "Jitte Davidson",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  },
  "preset-jobfair": {
    "src": "/images/activity-templates/career-fair.webp",
    "alt": "招聘交流中求职者与招聘人员握手",
    "source": "https://www.pexels.com/photo/woman-getting-a-job-interview-5989931/",
    "author": "cottonbro studio",
    "license": "Pexels License",
    "licenseUrl": "https://www.pexels.com/license/"
  }
};
export const FALLBACK_PRESET_IMAGE="/images/activity-templates/fallback.svg";
