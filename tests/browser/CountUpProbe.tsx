import { useCountUp } from '../../src/hooks/useCountUp'

export function CountUpProbe({ value }: { value: number }) {
  const displayed = useCountUp(value)
  return <output className="count-up-probe" data-end={value}>{displayed}</output>
}
