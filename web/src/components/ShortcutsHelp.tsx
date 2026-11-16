import { Kbd, Modal, Table } from '@mantine/core';

export const SHORTCUTS: readonly { keys: string; label: string }[] = [
  { keys: '1', label: 'Activité : tout' },
  { keys: '2', label: 'Activité : parapente' },
  { keys: '3', label: 'Activité : paramoteur' },
  { keys: 't', label: 'Basculer le thème clair / sombre' },
  { keys: '/', label: 'Rechercher un pilote dans les filtres' },
  { keys: '?', label: 'Afficher cette aide' },
  { keys: 'Échap', label: 'Effacer le surlignage et fermer cette fenêtre' },
];

interface Props {
  opened: boolean;
  onClose: () => void;
}

/** Modale d'aide listant les raccourcis clavier. */
export function ShortcutsHelp({ opened, onClose }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Raccourcis clavier" size="sm">
      <Table aria-label="Raccourcis clavier">
        <Table.Tbody>
          {SHORTCUTS.map((s) => (
            <Table.Tr key={s.keys}>
              <Table.Th scope="row" w={80}>
                <Kbd>{s.keys}</Kbd>
              </Table.Th>
              <Table.Td>{s.label}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Modal>
  );
}
