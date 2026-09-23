/* Deep links into the AWS Console for a resource, so "go fix it by hand" is one click. */
export function consoleUrl({ service, resource_id: id = '', resource_name: name = '', region }) {
  const r = region && region !== 'global' ? region : 'us-east-1'
  const svc = (service || '').toLowerCase()
  if (svc === 's3') {
    const bucket = name || id.replace(/^arn:aws:s3:::/, '').split('/')[0]
    return bucket ? `https://s3.console.aws.amazon.com/s3/buckets/${encodeURIComponent(bucket)}` : 'https://s3.console.aws.amazon.com/s3/home'
  }
  if (svc === 'iam') {
    if (/:root$/.test(id)) return 'https://console.aws.amazon.com/iam/home#/security_credentials'
    const user = id.match(/:user\/(.+)$/)?.[1]
    if (user) return `https://console.aws.amazon.com/iam/home#/users/details/${encodeURIComponent(user)}`
    const role = id.match(/:role\/(.+)$/)?.[1]
    if (role) return `https://console.aws.amazon.com/iam/home#/roles/details/${encodeURIComponent(role)}`
    return 'https://console.aws.amazon.com/iam/home'
  }
  if (svc === 'ec2') {
    if (id.startsWith('sg-')) return `https://console.aws.amazon.com/ec2/home?region=${r}#SecurityGroup:groupId=${id}`
    if (id.startsWith('i-')) return `https://console.aws.amazon.com/ec2/home?region=${r}#InstanceDetails:instanceId=${id}`
    if (id.startsWith('vol-')) return `https://console.aws.amazon.com/ec2/home?region=${r}#VolumeDetails:volumeId=${id}`
    return `https://console.aws.amazon.com/ec2/home?region=${r}`
  }
  if (svc === 'rds') {
    const db = name || id.split(':').pop()
    return `https://console.aws.amazon.com/rds/home?region=${r}#database:id=${encodeURIComponent(db)}`
  }
  return null
}

export const SERVICE_NAMES = { s3: 'Amazon S3', iam: 'AWS IAM', ec2: 'Amazon EC2', rds: 'Amazon RDS', lambda: 'AWS Lambda', dynamodb: 'DynamoDB' }
