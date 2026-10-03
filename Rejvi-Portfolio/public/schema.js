export const profileFields={name:'Full name',shortName:'Short name',role:'Professional role',headline:'Headline',tagline:'Animated hero lines (one per line)',intro:'Introduction',about:'About / biography',now:'What I’m working on now',location:'Location',availability:'Availability',email:'Public email',phone:'Public phone (optional)',timezone:'Time zone',github:'GitHub URL',linkedin:'LinkedIn URL',photo:'Portrait image',resume:'Résumé PDF',preferredContact:'Preferred contact method',contactHours:'Best contact hours',workPreference:'Work preference',workLocations:'Preferred work locations',opportunities:'Open to',internship:'Internship note',languages:'Languages (one per line)',recognition:'Recognition label',awardYears:'Award years'};
export const collections={
  events:{label:'Special events',fields:{title:'Event title',message:'Visitor message',start:'Start date (YYYY-MM-DD)',end:'End date (YYYY-MM-DD)',emoji:'Emoji / symbol',style:'Style: celebration, birthday, national, or minimal'},flags:{enabled:'Enabled',annual:'Repeat every year'}},
 projects:{label:'Projects',fields:{title:'Project title',category:'Category',date:'Date / period',description:'Overview',stack:'Tools (comma separated)',challenge:'The challenge',approach:'Your approach',outcome:'Outcome / what you learned',url:'Live URL',github:'Repository URL',image:'Cover image',gallery:'Gallery image URLs (one per line)'},flags:{published:'Published',featured:'Featured on home'}},
 skills:{label:'Skills',fields:{title:'Group name',items:'Skills (comma separated)'}},
 education:{label:'Education',fields:{title:'Qualification',institution:'Institution',period:'Period',detail:'Details'}},
 experience:{label:'Experience',fields:{title:'Role',institution:'Organization',period:'Period',detail:'Responsibilities & achievements',url:'Organization URL'}},
 services:{label:'Services',fields:{title:'Service name',description:'Description',icon:'Icon: code, spark, or grid'}},
 awards:{label:'Awards',fields:{title:'Award name',institution:'Awarding institution',period:'Year',detail:'Details',url:'Credential URL'}},
 certifications:{label:'Certifications',fields:{title:'Certificate name',institution:'Issuer',period:'Date',detail:'Details',url:'Verification URL',image:'Certificate image'}},
 research:{label:'Research',fields:{title:'Research / publication title',institution:'Journal / institution',period:'Year',detail:'Summary',url:'Publication URL'}},
 volunteering:{label:'Volunteering',fields:{title:'Role',institution:'Organization',period:'Period',detail:'Contribution',url:'Organization URL'}},
 interests:{label:'Interests',fields:{title:'Interest',description:'Description'}},
 testimonials:{label:'Testimonials',fields:{title:'Person’s name',institution:'Role / organization',description:'Approved testimonial',image:'Portrait'}},
 faqs:{label:'FAQs',fields:{title:'Question',description:'Answer'}}
};
export const longFields=new Set(['headline','tagline','intro','about','now','languages','description','detail','items','challenge','approach','outcome','gallery','message','petMessages']);
