// The "Personal Information" card of the profile page. Split out of ProfilePage.jsx; it gets everything it needs as props.


export function PersonalInfoCard(props) {
  const { form, handleChange } = props;
  return (
    <>
    <div className="card">

      <h2>Personal Information</h2>

      <label>
        Name
      </label>

      <input
        type="text"
        name="name"
        value={form.name}
        onChange={handleChange}
        placeholder="Your name"
      />

      <label>
        Age
      </label>

      <input
        type="number"
        name="age"
        min="1"
        max="120"
        value={form.age}
        onChange={handleChange}
        placeholder="Age"
      />

      <label>
        Sex
      </label>

      <select
        name="sex"
        value={form.sex}
        onChange={handleChange}
      >
        <option value="">
          Select
        </option>

        <option value="male">
          Male
        </option>

        <option value="female">
          Female
        </option>

        <option value="other">
          Other
        </option>
      </select>

    </div>
    </>
  );
}
