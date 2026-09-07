const ICON_LABELS={
  helmet:'Helmet',
  football:'Football',
  trophy:'Trophy',
  stadium:'Stadium',
  playbook:'Playbook',
  megaphone:'Megaphone',
  goalpost:'Goalpost',
  star:'Star'
};

function Icon({name}){
  if(name==='football'){
    return <><path d="M5 17c-3-3-2-7 1-10s7-4 10-1 2 7-1 10-7 4-10 1Z"/><path d="m9 9 6 6M11 9l-2 2m5 1-2 2"/></>;
  }

  if(name==='trophy'){
    return <><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3M12 13v4m-4 3h8m-6-3h4"/></>;
  }

  if(name==='stadium'){
    return <><path d="M3 10c2-3 16-3 18 0v7c-2 3-16 3-18 0v-7Z"/><path d="M6 9v8m12-8v8M8 13h8m-6 4v-4h4v4"/></>;
  }

  if(name==='playbook'){
    return <><path d="M5 3h14v18H5z"/><circle cx="9" cy="9" r="1.5"/><path d="m11 15 4-4m0 0v3m0-3h-3M8 18h8"/></>;
  }

  if(name==='megaphone'){
    return <><path d="m4 11 12-5v12L4 13v-2Z"/><path d="M16 10h3a2 2 0 0 1 0 4h-3M7 14l2 6h3l-1-5"/></>;
  }

  if(name==='goalpost'){
    return <><path d="M5 4v7h14V4M12 11v9M8 20h8"/></>;
  }

  if(name==='star'){
    return <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>;
  }

  return <><path d="M5 14V9a7 7 0 0 1 14 0v5h-5v-3H9v5H5v-2Z"/><path d="M14 14h5v4h-5m-5-7v3H5"/></>;
}

export function RosterAvatar({
  avatarKey='helmet',
  avatarColor='blue',
  size='md',
  className=''
}){
  const icon=ICON_LABELS[avatarKey]?avatarKey:'helmet';
  const color=[
    'blue','green','red','gold',
    'purple','orange','teal','slate'
  ].includes(avatarColor)
    ?avatarColor
    :'blue';

  return <span
    className={`rosterAvatar rosterAvatar-${size} avatar-${color} ${className}`.trim()}
    title={ICON_LABELS[icon]}
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <Icon name={icon}/>
    </svg>
  </span>;
}

export const ROSTER_ICONS=Object.entries(ICON_LABELS).map(
  ([key,label])=>({key,label})
);

export const ROSTER_COLORS=[
  'blue',
  'green',
  'red',
  'gold',
  'purple',
  'orange',
  'teal',
  'slate'
];
