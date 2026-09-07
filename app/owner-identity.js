import Link from 'next/link';
import {RosterAvatar} from './roster-avatar';

export function OwnerIdentity({
  owner,
  href,
  size='md',
  compact=false,
  className=''
}){
  const ownerName=owner?.owner_name||owner?.name||'Owner';
  const rosterName=owner?.roster_name?.trim()||`${ownerName}'s Team`;

  const identity=<span
    className={[
      'ownerIdentity',
      compact?'ownerIdentityCompact':'',
      className
    ].filter(Boolean).join(' ')}
  >
    <RosterAvatar
      avatarKey={owner?.avatar_key}
      avatarColor={owner?.avatar_color}
      size={size}
    />
    <span className="ownerIdentityText">
      <b>{rosterName}</b>
      <small>{ownerName}</small>
    </span>
  </span>;

  if(!href)return identity;

  return <Link className="ownerIdentityLink" href={href}>
    {identity}
  </Link>;
}
